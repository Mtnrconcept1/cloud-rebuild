import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  LockKeyhole,
  Search,
  ShieldCheck,
  Store,
  Table2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const PAGE_PATH = "/tok-connect";
const CANONICAL_ORIGIN = "https://www.thetok.ch";
const CHATGPT_MCP_SERVER_URL = `${CANONICAL_ORIGIN}/mcp`;

const quickLinks: Array<{ label: string; helper: string; href: string; icon: LucideIcon }> = [
  {
    label: "Tester le module",
    helper: "Aperçu du widget restaurants TOK",
    href: "/tok-connect/mcp-widget",
    icon: Bot,
  },
  {
    label: "Portail développeur",
    helper: "API, sandbox et diagnostics techniques",
    href: "/tok-connect/developer",
    icon: Code2,
  },
  {
    label: "Supervision admin",
    helper: "Restaurants autorisés et activité MCP",
    href: "/admin/tok-connect",
    icon: ShieldCheck,
  },
  {
    label: "Consentements restaurant",
    helper: "Vue restaurateur et état de connexion",
    href: "/dashboard/tok-connect",
    icon: Table2,
  },
  {
    label: "API REST",
    helper: "Intégrations serveur à serveur",
    href: "#api-rest",
    icon: Code2,
  },
  {
    label: "Webhooks",
    helper: "Événements signés et auditables",
    href: "#webhooks",
    icon: Webhook,
  },
];

const installSteps = [
  {
    step: "1",
    title: "Ajouter TOK Connect dans ChatGPT",
    body: "Créez un nouveau MCP/connecteur dans ChatGPT depuis les paramètres des outils ou applications.",
  },
  {
    step: "2",
    title: "Coller une seule URL",
    body: `Utilisez ${CHATGPT_MCP_SERVER_URL} comme adresse du serveur MCP. Rien d’autre n’est à copier depuis TOK.`,
  },
  {
    step: "3",
    title: "Choisir OAuth",
    body: "Sélectionnez OAuth comme authentification. ChatGPT découvre la configuration TOK et ouvre le parcours de connexion automatiquement.",
  },
  {
    step: "4",
    title: "Se connecter à TOK",
    body: "Connectez-vous avec votre compte TOK et acceptez l’accès. Le module TOK s’ouvre automatiquement dès qu’une demande appelle un outil compatible.",
  },
];

const screenshots = [
  {
    title: "Une sélection de restaurants directement dans ChatGPT",
    src: "/images/tok-connect/tok-connect-widget-restaurants.png",
    alt: "Widget TOK Connect affichant une sélection de restaurants dans ChatGPT",
    body: "Une demande comme « trois pizzerias et deux sushis à Genève » ouvre un vrai module TOK avec des cartes classées, photos, notes et informations utiles.",
  },
  {
    title: "Une fiche restaurant complète au clic",
    src: "/images/tok-connect/tok-connect-widget-details.png",
    alt: "Widget TOK Connect affichant la fiche détaillée d'un restaurant",
    body: "Le clic sur une carte ouvre la fiche : adresse, horaires, menu, réservation et contexte restaurant sans quitter la conversation.",
  },
];

const capabilities = [
  {
    icon: Search,
    title: "Découverte restaurant",
    body: "Recherche multi-critères et multi-cuisines avec classement TOK, cartes visuelles et fiches détaillées.",
  },
  {
    icon: Activity,
    title: "Disponibilités en temps réel",
    body: "Lecture des créneaux réellement disponibles avant toute proposition de réservation.",
  },
  {
    icon: Table2,
    title: "Réservations contrôlées",
    body: "Préparation puis création d’une réservation uniquement après confirmation explicite de l’utilisateur.",
  },
  {
    icon: Store,
    title: "Accès restaurant maîtrisé",
    body: "TOK peut autoriser ou révoquer un restaurant du MCP instantanément depuis l’Admin, sans identifiant technique à saisir.",
  },
  {
    icon: ShieldCheck,
    title: "Permissions serveur",
    body: "Les contrôles d’accès, rôles et limites sont appliqués côté TOK. ChatGPT ne reçoit jamais de secret serveur.",
  },
  {
    icon: Webhook,
    title: "Audit et événements",
    body: "Les appels et actions sensibles restent traçables avec statut, restaurant et application à l’origine de la requête.",
  },
];

export default function TokConnect() {
  const { toast } = useToast();

  useSeoMeta({
    title: "TOK Connect — TOK dans ChatGPT",
    description: "Connectez TOK à ChatGPT avec une seule URL MCP et OAuth, puis découvrez restaurants, disponibilités et réservations dans un module visuel.",
    canonical: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
  });

  async function copyMcpUrl() {
    try {
      await navigator.clipboard.writeText(CHATGPT_MCP_SERVER_URL);
      toast({ title: "URL copiée", description: "Collez-la dans le champ URL du serveur MCP dans ChatGPT." });
    } catch {
      toast({ title: "Copie impossible", description: CHATGPT_MCP_SERVER_URL, variant: "destructive" });
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-orange-50 via-background to-amber-50/70 px-4 py-16 dark:from-orange-500/10 dark:to-amber-500/5 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-primary">
              <Bot className="h-4 w-4" />TOK Connect
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              TOK directement dans ChatGPT.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              Une seule URL MCP, OAuth automatique, puis votre compte TOK. Ensuite ChatGPT peut ouvrir le module TOK pour rechercher des restaurants, consulter leurs fiches et préparer des réservations.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button type="button" className="rounded-xl" onClick={() => void copyMcpUrl()}>
                <Copy className="mr-2 h-4 w-4" />Copier l’URL MCP
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/tok-connect/mcp-widget">Voir le widget <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-primary/20 bg-slate-950 p-6 text-white shadow-2xl shadow-orange-500/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">Adresse unique</p>
            <code className="mt-3 block overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm font-bold sm:text-base">
              {CHATGPT_MCP_SERVER_URL}
            </code>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />Pas de paramétrage technique à recopier.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />OAuth et connexion TOK sont découverts automatiquement.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />Les permissions restent contrôlées côté TOK.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Navigation</p>
          <h2 className="mt-2 text-3xl font-black">Accès rapides TOK Connect</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            const internal = item.href.startsWith("/");
            const content = (
              <div className="group flex h-full items-start gap-4 rounded-3xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="font-black">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{item.helper}</p></div>
                <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            );
            return internal
              ? <Link key={item.label} to={item.href}>{content}</Link>
              : <a key={item.label} href={item.href}>{content}</a>;
          })}
        </div>
      </section>

      <section id="deployer-mcp-api" className="border-y bg-muted/20 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Installation</p>
          <h2 className="mt-2 text-3xl font-black">Ajouter TOK Connect dans ChatGPT</h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">Le parcours actuel ne demande plus de recopier une configuration d’authentification détaillée. L’URL MCP et OAuth suffisent.</p>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {installSteps.map((item) => (
              <article key={item.step} className="rounded-3xl border bg-card p-5">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-black text-primary-foreground">{item.step}</div>
                <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black">Dans ChatGPT, renseignez seulement le serveur TOK et OAuth.</p>
                <p className="mt-1 text-sm text-muted-foreground">Une fois connecté, il suffit de demander des restaurants ou une réservation pour que le module apparaisse.</p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copyMcpUrl()}>
                <Copy className="mr-2 h-4 w-4" />{CHATGPT_MCP_SERVER_URL}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">MCP en action</p>
        <h2 className="mt-2 text-3xl font-black">Le module TOK dans la conversation</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">Ces captures montrent le vrai parcours : sélection puis fiche détaillée, directement dans l’expérience ChatGPT.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {screenshots.map((screenshot) => (
            <figure key={screenshot.src} className="overflow-hidden rounded-[2rem] border bg-card shadow-sm">
              <div className="aspect-[16/10] overflow-hidden bg-slate-950">
                <img src={screenshot.src} alt={screenshot.alt} className="h-full w-full object-cover object-top" loading="lazy" />
              </div>
              <figcaption className="p-5 sm:p-6">
                <h3 className="text-xl font-black">{screenshot.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{screenshot.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="mcp-server" className="border-y bg-muted/20 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Fonctionnalités</p>
          <h2 className="mt-2 text-3xl font-black">Ce que TOK Connect sait faire</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-3xl border bg-card p-5">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="api-rest" className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
        <article className="rounded-[2rem] border bg-card p-6">
          <div className="flex items-center gap-2 text-primary"><Code2 className="h-5 w-5" /><span className="text-sm font-black uppercase tracking-[0.16em]">Développeurs</span></div>
          <h2 className="mt-3 text-2xl font-black">API REST et sandbox</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Les intégrations serveur à serveur et diagnostics restent disponibles dans le portail développeur. Ils ne font pas partie du parcours normal d’installation ChatGPT.</p>
          <Button asChild variant="outline" className="mt-5 rounded-xl"><Link to="/tok-connect/developer">Ouvrir le portail développeur <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </article>

        <article id="webhooks" className="rounded-[2rem] border bg-card p-6">
          <div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-5 w-5" /><span className="text-sm font-black uppercase tracking-[0.16em]">Sécurité</span></div>
          <h2 className="mt-3 text-2xl font-black">Permissions et audit côté TOK</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">L’administrateur choisit quels restaurants sont accessibles au MCP. Les appels sont ensuite tracés par restaurant et par agent/application, avec confirmation pour les actions sensibles.</p>
          <Button asChild variant="outline" className="mt-5 rounded-xl"><Link to="/admin/tok-connect">Ouvrir la supervision <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
        </article>
      </section>
    </main>
  );
}
