import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ChevronRight,
  Code2,
  Filter,
  ExternalLink,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Map,
  Search,
  ServerCog,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { buildGuidePdf, downloadGuidePdf, type GuidePdfImage } from "@/lib/guidePdf";
import { toast } from "sonner";
import {
  TOK_USER_GUIDE_META,
  TOK_USER_GUIDE_ROUTES,
  TOK_USER_GUIDE_TOOLS,
} from "@/data/tok-user-guide-catalog.generated";
import {
  BUYER_GUIDE_CHAPTERS,
  GUIDE_SCREENSHOTS,
  GUIDE_REVIEW_DATE,
  RESTAURANT_GUIDE_CHAPTERS,
  RESTAURANT_GUIDE_ROUTE_LABELS,
  SURFACE_LABELS,
  isRestaurantGuideRoute,
  type GuideChapter,
} from "@/data/userGuideContent";
import {
  getRouteGuideDetail,
  getToolGuideDetail,
  type GuideFeatureDetail,
} from "@/data/userGuideFeatureDetails";

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
            {audience === "buyer" ? <a href="#captures" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-900">
              <ImageIcon className="h-4 w-4" /> Captures
            </a> : null}
            <a href="#index" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-900">
              <Search className="h-4 w-4" /> {audience === "restaurant" ? "Trouver une rubrique" : "Index complet"}
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

function ChapterCard({ chapter, audience }: { chapter: GuideChapter; audience: Audience }) {
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
      {audience === "restaurant" ? (
        <>
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Où trouver ces outils dans TOK ?</h3>
            <div className="flex flex-wrap gap-2">
              {chapter.routes.map((route) => (
                <Link
                  key={route}
                  to={route}
                  className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-800 transition hover:border-orange-400 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200"
                >
                  {RESTAURANT_GUIDE_ROUTE_LABELS[route]}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2" aria-label="Routes associées">
          {chapter.routes.map((route) => (
            <code key={route} className="rounded-lg border bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{route}</code>
          ))}
        </div>
      )}
      <div className="mt-7 grid gap-4 md:grid-cols-2" aria-label={`Captures d’écran : ${chapter.title}`}>
        {chapter.screenshots?.map((screenshot) => (
          <figure key={screenshot.src} className="overflow-hidden rounded-2xl border bg-slate-50 dark:bg-slate-950">
            <img src={screenshot.src} alt={screenshot.alt} className="h-auto max-h-96 w-full object-contain" loading="lazy" />
            <figcaption className="space-y-1 p-4">
              <p className="text-sm font-bold">{screenshot.title}</p>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{screenshot.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function DetailList({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: readonly string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <section>
      <h3 className="flex items-center gap-2 text-base font-black">
        <ClipboardCheck className="h-4 w-4 text-[#ff6a1a]" /> {title}
      </h3>
      <List className={`mt-3 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${ordered ? "list-decimal pl-5" : "list-disc pl-5"}`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </List>
    </section>
  );
}

function FeatureDetailPanel({
  detail,
  onOpenChange,
}: {
  detail: GuideFeatureDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const canOpenReference = Boolean(
    detail?.kind === "route"
    && detail.reference.startsWith("/")
    && !detail.reference.includes(":")
    && detail.reference !== "*",
  );

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      {detail ? (
        <DialogContent className="max-h-[94dvh] max-w-6xl gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-2xl">
          <div data-dialog-scroll-area className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="border-b bg-gradient-to-br from-orange-50 via-white to-violet-50 px-5 py-6 pr-14 sm:px-8 sm:py-8 dark:from-orange-500/10 dark:via-slate-950 dark:to-violet-500/10">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#ff6a1a] text-white hover:bg-[#ff6a1a]">
                  {detail.kind === "route" ? "Fonction de l’application" : "Outil serveur"}
                </Badge>
                <Badge variant="outline">{detail.category}</Badge>
              </div>
              <DialogTitle className="mt-4 max-w-4xl font-display text-3xl font-black tracking-tight sm:text-4xl">
                {detail.title}
              </DialogTitle>
              <code className="mt-3 block break-all text-xs font-bold text-[#d94d00] dark:text-orange-300">{detail.reference}</code>
              <DialogDescription className="mt-4 max-w-4xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {detail.purpose}
              </DialogDescription>
            </div>

            <div className="grid gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
              <div className="space-y-8">
                {detail.screenshot ? (
                  <figure className="overflow-hidden rounded-2xl border bg-slate-100 shadow-sm dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-3 dark:bg-slate-900">
                      <Badge variant={detail.screenshot.representation === "exact-route" ? "default" : "secondary"}>
                        {detail.screenshot.representation === "exact-route"
                          ? "Capture exacte de cet écran"
                          : "Surface associée — pas l’écran de l’outil"}
                      </Badge>
                      <code className="text-xs font-bold text-slate-500">{detail.screenshot.capturedRoute}</code>
                    </div>
                    <img
                      src={detail.screenshot.src}
                      alt={detail.screenshot.alt}
                      className="max-h-[38rem] w-full object-contain object-top"
                    />
                    <figcaption className="border-t bg-white p-4 text-sm leading-relaxed dark:bg-slate-900">
                      <p className="font-bold">{detail.screenshot.caption}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail.screenshot.provenance}</p>
                    </figcaption>
                  </figure>
                ) : (
                  <section
                    data-testid="guide-exact-screenshot-missing"
                    className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 dark:border-amber-500/40 dark:bg-amber-500/10"
                  >
                    <div className="flex items-start gap-4">
                      <span className="rounded-2xl bg-white p-3 text-amber-700 shadow-sm dark:bg-slate-900 dark:text-amber-300">
                        <CameraOff className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-black">Aucune capture générique utilisée</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          {detail.kind === "tool"
                            ? "Ce service serveur n’a pas d’écran autonome et aucune surface suffisamment précise n’a encore été associée. Le guide préfère ne montrer aucune image plutôt qu’une capture trompeuse."
                            : "Aucune capture exacte et validée n’est encore publiée pour cette route. Le guide préfère ne montrer aucune image plutôt qu’un autre écran de l’application."}
                        </p>
                        {canOpenReference ? (
                          <Button asChild variant="outline" className="mt-4">
                            <a href={detail.reference} target="_blank" rel="noreferrer">
                              Ouvrir l’écran réel <ExternalLink className="ml-2 h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                  <h3 className="flex items-center gap-2 text-base font-black"><Info className="h-4 w-4 text-violet-600" /> Fonctionnement précis</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{detail.explanation}</p>
                </section>

                <DetailList title="Procédure étape par étape" items={detail.steps} ordered />
                <DetailList title="Résultat attendu" items={detail.expectedResults} />
              </div>

              <aside className="space-y-6">
                <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/10">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200">Accès requis</h3>
                  <p className="mt-3 text-sm leading-relaxed">{detail.access}</p>
                </section>
                <DetailList title="Avant de commencer" items={detail.prerequisites} />
                <DetailList title="Contrôles et précautions" items={detail.safeguards} />
                <section className="rounded-2xl border bg-slate-50 p-5 dark:bg-slate-950">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Repères techniques</h3>
                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {detail.technicalNotes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </section>
              </aside>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RouteResult({ route, onSelect }: { route: RouteEntry; onSelect: () => void }) {
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
      <Button type="button" variant="outline" className="mt-5 w-full justify-between" onClick={onSelect}>
        Voir le mode d’emploi détaillé <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}

function ToolResult({ tool, onSelect }: { tool: ToolEntry; onSelect: () => void }) {
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
      <Button type="button" variant="outline" className="mt-5 w-full justify-between" onClick={onSelect}>
        Comprendre cet outil <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}


function RestaurantGuideIndex({ chapters }: { chapters: readonly GuideChapter[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase("fr");
  const results = chapters.filter((chapter) => {
    const words = [
      chapter.title,
      chapter.summary,
      ...chapter.steps,
      ...chapter.routes.map((route) => RESTAURANT_GUIDE_ROUTE_LABELS[route] || ""),
    ].join(" ").toLocaleLowerCase("fr");
    return !term || term.split(/\s+/).every((word) => words.includes(word));
  });

  return (
    <section id="index" className="scroll-mt-28 space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6a1a]">Retrouver une explication</p>
        <h2 className="mt-2 font-display text-3xl font-black">Quel outil souhaitez-vous utiliser ?</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Recherchez un nom du menu, par exemple « Reservations », « Menu » ou « Facturation ».</p>
      </div>
      <label htmlFor="restaurant-guide-search" className="sr-only">Rechercher une rubrique</label>
      <Input
        id="restaurant-guide-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ex. commandes, offres, factures…"
        className="h-12 rounded-2xl"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((chapter) => (
          <a key={chapter.id} href={`#${chapter.id}`} className="rounded-2xl border bg-white p-5 hover:border-orange-300 dark:bg-slate-900">
            <h3 className="font-bold">{chapter.title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{chapter.summary}</p>
          </a>
        ))}
        {results.length === 0 ? <p className="text-sm text-slate-500">Aucune rubrique trouvée. Essayez un autre mot.</p> : null}
      </div>
    </section>
  );
}

function SearchIndex({ audience }: { audience: Audience }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<InventoryKind>("routes");
  const [category, setCategory] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");

  const routes = useMemo(
    () => TOK_USER_GUIDE_ROUTES.filter((route) => audience === "buyer" || isRestaurantGuideRoute(route)),
    [audience],
  );

  const selectedDetail = useMemo(() => {
    const selectedId = searchParams.get("fonction");
    if (!selectedId) return null;
    const selectedRoute = routes.find((route) => getRouteGuideDetail(route).id === selectedId);
    if (selectedRoute) return getRouteGuideDetail(selectedRoute);
    if (audience === "buyer") {
      const selectedTool = TOK_USER_GUIDE_TOOLS.find((tool) => getToolGuideDetail(tool).id === selectedId);
      if (selectedTool) return getToolGuideDetail(selectedTool);
    }
    return null;
  }, [audience, routes, searchParams]);

  const selectDetail = (detail: GuideFeatureDetail) => {
    const next = new URLSearchParams(searchParams);
    next.set("fonction", detail.id);
    setSearchParams(next, { replace: false });
  };

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("fonction");
    setSearchParams(next, { replace: true });
  };

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
      const detail = getRouteGuideDetail(route);
      const haystack = [route.path, route.surface, ...route.components, ...route.requiredRoles, route.featureGate || "", route.redirectTo || "", detail.title, detail.purpose, detail.explanation, ...detail.steps].join(" ").toLocaleLowerCase("fr");
      return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term));
    }),
    [category, normalizedQuery, routes],
  );

  const filteredTools = useMemo(
    () => TOK_USER_GUIDE_TOOLS.filter((tool) => {
      if (category !== "all" && getToolCategory(tool) !== category) return false;
      if (!normalizedQuery) return true;
      const detail = getToolGuideDetail(tool);
      const haystack = [tool.name, tool.endpoint, ...tool.methods, ...tool.actions, ...tool.integrations, getToolCategory(tool), detail.purpose, detail.explanation, ...detail.steps].join(" ").toLocaleLowerCase("fr");
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
        <h2 className="mt-2 font-display text-3xl font-black">Sélectionner une fonctionnalité, une route ou un outil</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          {audience === "restaurant"
            ? "L’index est limité aux parcours du restaurateur et aux pages publiques qui lui sont utiles. Chaque résultat ouvre une procédure illustrée et détaillée."
            : "L’index complet couvre les routes frontend et les services serveur détectés dans le dépôt. Chaque résultat ouvre sa fiche de référence illustrée."}
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
            ? filteredRoutes.map((route) => (
              <RouteResult
                key={`${route.surface}-${route.path}`}
                route={route}
                onSelect={() => selectDetail(getRouteGuideDetail(route))}
              />
            ))
            : filteredTools.map((tool) => (
              <ToolResult
                key={tool.name}
                tool={tool}
                onSelect={() => selectDetail(getToolGuideDetail(tool))}
              />
            ))}
        </div>
      )}

      <FeatureDetailPanel detail={selectedDetail} onOpenChange={(open) => { if (!open) closeDetail(); }} />
    </section>
  );
}

async function loadGuidePdfImage(src: string, caption: string): Promise<GuidePdfImage> {
  const response = await fetch(src, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Capture indisponible : ${src}`);
  const image = await createImageBitmap(await response.blob());
  try {
    const ratio = Math.min(1, 1100 / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossible de préparer la capture PDF.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
    if (!encoded) throw new Error("Impossible de convertir la capture PDF.");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { data: bytes, width: canvas.width, height: canvas.height, caption };
  } finally {
    image.close();
  }
}

function GuidePage({ audience }: { audience: Audience }) {
  const isRestaurant = audience === "restaurant";
  const chapters = isRestaurant ? RESTAURANT_GUIDE_CHAPTERS : BUYER_GUIDE_CHAPTERS;
  const title = isRestaurant ? "Guide restaurateur TOK" : "Guide administrateur TOK";
  const path = isRestaurant ? "/dashboard/guide" : "/admin/guide";

  useSeoMeta({
    title,
    description: isRestaurant
      ? "Mode d’emploi TOK réservé aux restaurateurs : outils, captures, recherche et parcours opérationnels, sans contenu d’administration."
      : "Documentation interne de l’administration TOK : rôles, surfaces, fonctions, supervision, outils serveur et intégrations.",
    path,
  });

  const routeCount = isRestaurant
    ? TOK_USER_GUIDE_ROUTES.filter(isRestaurantGuideRoute).length
    : TOK_USER_GUIDE_META.routeCount;

  const exportPdf = async () => {
    const sections: { title: string; lines: string[]; images?: GuidePdfImage[] }[] = chapters.map((chapter) => ({
      title: chapter.title,
      lines: [
        `Guide relu le ${GUIDE_REVIEW_DATE}.`, chapter.summary, "",
        ...chapter.steps.map((step, index) => `${index + 1}. ${step}`),
        "", isRestaurant
          ? `Dans le menu TOK : ${chapter.routes.map((route) => RESTAURANT_GUIDE_ROUTE_LABELS[route]).join(", ")}`
          : `Parcours associés : ${chapter.routes.join(", ")}`,
        ...(isRestaurant ? chapter.screenshots?.map((shot) => `Illustration : ${shot.caption}`) || [] : []),
      ],
    }));
    const routes = TOK_USER_GUIDE_ROUTES.filter((route) => !isRestaurant || isRestaurantGuideRoute(route));
    if (!isRestaurant) for (const surface of [...new Set(routes.map((route) => route.surface))]) {
      const entries = routes.filter((route) => route.surface === surface);
      sections.push({
        title: `Index des pages - ${SURFACE_LABELS[surface] || surface}`,
        lines: entries.flatMap((route) => {
          const detail = getRouteGuideDetail(route);
          return [
            `${route.path} - ${getRouteTitle(route)} (${getRouteAccess(route)})`,
            detail.purpose,
            ...detail.steps.map((step, index) => `  ${index + 1}. ${step}`),
            `Resultat attendu : ${detail.expectedResults.join("; ")}`,
            "",
          ];
        }),
      });
    }
    if (!isRestaurant) {
      for (const category of [...new Set(TOK_USER_GUIDE_TOOLS.map(getToolCategory))]) {
        const tools = TOK_USER_GUIDE_TOOLS.filter((tool) => getToolCategory(tool) === category);
        sections.push({
          title: `Outils serveur - ${category}`,
          lines: tools.flatMap((tool) => {
            const detail = getToolGuideDetail(tool);
            return [
              `${tool.name} - ${tool.endpoint}`,
              detail.purpose,
              ...detail.steps.map((step, index) => `  ${index + 1}. ${step}`),
              `Vigilance : ${detail.safeguards.join("; ")}`,
              "",
            ];
          }),
        });
      }
    }
    try {
      for (const [index, chapter] of chapters.entries()) {
        sections[index].images = await Promise.all(
          (chapter.screenshots || []).map((image) => loadGuidePdfImage(image.src, image.caption)),
        );
      }
      const bytes = buildGuidePdf({
        title,
        subtitle: isRestaurant
          ? "Mode d’emploi du restaurateur, avec des captures TOK et des explications pratiques."
          : "Documentation interne, accessible depuis le dashboard administrateur.",
        sections,
      });
      downloadGuidePdf(bytes, isRestaurant ? "TOK_Guide_Restaurateur.pdf" : "TOK_Guide_Administrateur.pdf");
    } catch {
      toast.error("Le PDF n’a pas été créé : une capture est momentanément indisponible. Réessayez.");
    }
  };

  return (
    <div className={isRestaurant ? "tok-restaurant-guide text-foreground" : "min-h-screen bg-[#f7f7f8] text-slate-950 dark:bg-slate-950 dark:text-slate-50"}>
      <header className={isRestaurant ? "tok-guide-toolbar border-b" : "sticky top-0 z-40 border-b bg-white/95 backdrop-blur dark:bg-slate-950/95"}>
        <div className="container flex min-h-16 max-w-[92rem] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={isRestaurant ? "/dashboard" : "/admin"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6a1a] text-sm font-black text-white">TOK</Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{title}</p>
              <p className="hidden text-xs text-slate-500 sm:block">Guide relu le {GUIDE_REVIEW_DATE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to={isRestaurant ? "/dashboard" : "/admin"}>Revenir au dashboard</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportPdf}>
              <Download className="mr-2 h-4 w-4" /> Télécharger le PDF
            </Button>
            <Button asChild size="sm" className="bg-[#ff6a1a] text-white hover:bg-[#e85a0a]">
              <a href="#index"><Search className="mr-2 h-4 w-4" /> Rechercher</a>
            </Button>
          </div>
        </div>
      </header>

      {isRestaurant ? (
        <div id="vue-ensemble" className="scroll-mt-24">
          <DashboardPageHero
            badge="Assistance"
            title="Guide d’utilisation"
            description="Retrouvez les étapes et les conseils pour profiter de tous les outils de votre espace restaurateur."
            icon={BookOpen}
            stats={[
              { label: "Rubriques expliquées", value: chapters.length, icon: BookOpen },
              { label: "Recherche", value: "Instantanée", icon: Search },
              { label: "Illustrations", value: "Captures TOK", icon: ImageIcon },
            ]}
          />
        </div>
      ) : null}

      <div className={isRestaurant ? "tok-guide-grid grid gap-6" : "container grid max-w-[92rem] gap-10 px-4 py-10 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)_14rem]"}>
        <GuideSidebar audience={audience} chapters={chapters} />

        <main className="min-w-0 space-y-10">
          {!isRestaurant ? <section id="vue-ensemble" className="scroll-mt-28 overflow-hidden rounded-[2rem] border bg-white shadow-sm dark:bg-slate-900">
            <div className={`p-7 md:p-10 ${isRestaurant ? "bg-gradient-to-br from-orange-50 via-white to-emerald-50 dark:from-orange-500/10 dark:via-slate-900 dark:to-emerald-500/10" : "bg-gradient-to-br from-violet-50 via-white to-orange-50 dark:from-violet-500/10 dark:via-slate-900 dark:to-orange-500/10"}`}>
              <Badge className={isRestaurant ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : "bg-violet-100 text-violet-800 hover:bg-violet-100"}>
                {isRestaurant ? "Parcours restaurateur uniquement" : "Référence complète & administration"}
              </Badge>
              <h1 className="mt-5 max-w-4xl font-display text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                {isRestaurant
                  ? "Le mode d’emploi opérationnel pour configurer votre établissement, gérer le service et développer votre activité, du menu à la facturation."
                  : "Manuel complet réservé aux administrateurs TOK : supervision, opérations, risques, surfaces applicatives et inventaire des outils serveur."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                {isRestaurant ? <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><BookOpen className="h-4 w-4 text-[#ff6a1a]" /> {chapters.length} rubriques expliquées</span> : <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><Map className="h-4 w-4 text-[#ff6a1a]" /> {routeCount} routes couvertes</span>}
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><Search className="h-4 w-4 text-[#ff6a1a]" /> Recherche instantanée</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><ImageIcon className="h-4 w-4 text-[#ff6a1a]" /> Captures réelles</span>
                {!isRestaurant ? <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><ServerCog className="h-4 w-4 text-violet-600" /> {TOK_USER_GUIDE_META.toolCount} outils serveur</span> : null}
              </div>
            </div>
          </section> : null}

          <section className="grid gap-4 sm:grid-cols-3" aria-label="Principes du guide">
            {[
              { icon: LayoutDashboard, title: "Hiérarchie claire", text: "Navigation par chapitres, comme un manuel de référence." },
              { icon: Search, title: "Index direct", text: "Un mot suffit pour retrouver une route ou un outil." },
              isRestaurant
                ? { icon: CheckCircle2, title: "Des étapes concrètes", text: "Suivez les actions à effectuer dans votre espace TOK." }
                : { icon: CheckCircle2, title: "Source vérifiable", text: "L’inventaire est régénéré depuis le code de l’application." },
            ].map(({ icon: Icon, title: cardTitle, text }) => (
              <div key={cardTitle} className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                <Icon className="h-5 w-5 text-[#ff6a1a]" />
                <h2 className="mt-3 font-bold">{cardTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
              </div>
            ))}
          </section>

          <div className="space-y-6">
            {chapters.map((chapter) => <ChapterCard key={chapter.id} chapter={chapter} audience={audience} />)}
          </div>

          {isRestaurant ? <RestaurantGuideIndex chapters={chapters} /> : (
            <>
              <ScreenshotGallery audience={audience} />
              <SearchIndex audience={audience} />
            </>
          )}
        </main>

        <aside className={isRestaurant ? "tok-guide-summary" : "hidden xl:block"}>
          <div className="sticky top-24 space-y-5 text-sm">
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Repères</p>
              <dl className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2"><dt>Chapitres</dt><dd className="font-black">{chapters.length}</dd></div>
                {!isRestaurant ? <div className="flex items-center justify-between gap-2"><dt>Routes</dt><dd className="font-black">{routeCount}</dd></div> : null}
                {!isRestaurant ? <div className="flex items-center justify-between gap-2"><dt>Outils serveur</dt><dd className="font-black">{TOK_USER_GUIDE_META.toolCount}</dd></div> : null}
              </dl>
            </div>
            {!isRestaurant ? <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <p className="flex items-center gap-2 font-bold"><Code2 className="h-4 w-4 text-slate-400" /> Fraîcheur</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Inventaire statique généré depuis la branche livrée. Les fonctions activées peuvent dépendre du rôle et de la configuration de l’environnement.
              </p>
            </div> : null}
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
  if (pathname === "/dashboard/guide") return <DashboardLayout mainClassName="tok-restaurant-page tok-page-guide"><GuidePage audience="restaurant" /></DashboardLayout>;
  if (pathname === "/admin/guide") return <GuidePage audience="buyer" />;
  return null;
}
