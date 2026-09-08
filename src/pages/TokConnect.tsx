import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  Code2,
  KeyRound,
  LockKeyhole,
  Send,
  ShieldCheck,
  Table2,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { SUPABASE_URL } from "@/lib/env";
import {
  buildTokConnectIntentPlan,
  tokConnectAccessLevels,
  tokConnectCoreEndpoints,
  tokConnectDeveloperPortalModules,
  tokConnectMcpPrompts,
  tokConnectMcpResources,
  tokConnectMcpTools,
  tokConnectPartnerWebhooks,
  tokConnectPricingTiers,
  tokConnectRoadmap,
  tokConnectSecurityControls,
  type TokConnectIntentPlan,
} from "@/lib/tokConnect";

const PAGE_PATH = "/tok-connect";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const clientIntent =
  "Trouve une table italienne ce soir à Genève pour deux personnes, moins de 80 CHF, avec confirmation client.";

const restaurantIntent =
  "Prépare une campagne pour remplir mes tables vides jeudi soir, sans diffusion automatique et avec coût estimé.";

const DEFAULT_CHATGPT_FUNCTIONS_BASE_URL = "https://www.thetok.ch/functions/v1";
const LOCAL_SUPABASE_URL_PATTERN = /(?:localhost|127\.0\.0\.1)/i;

function getChatGptFunctionsBaseUrl() {
  const supabaseUrl = SUPABASE_URL.replace(/\/+$/, "");
  if (!supabaseUrl || LOCAL_SUPABASE_URL_PATTERN.test(supabaseUrl)) return DEFAULT_CHATGPT_FUNCTIONS_BASE_URL;
  return `${supabaseUrl}/functions/v1`;
}

const CHATGPT_FUNCTIONS_BASE_URL = getChatGptFunctionsBaseUrl();
const CHATGPT_MCP_SERVER_URL = `${CANONICAL_ORIGIN}/mcp`;
const CHATGPT_OAUTH_AUTHORIZATION_URL = `${CHATGPT_FUNCTIONS_BASE_URL}/tok-connect-oauth/authorize`;
const CHATGPT_OAUTH_TOKEN_URL = `${CHATGPT_FUNCTIONS_BASE_URL}/tok-connect-oauth`;
const CHATGPT_REST_API_URL = `${CHATGPT_FUNCTIONS_BASE_URL}/tok-connect-api`;
const CHATGPT_MCP_DESCRIPTION =
  "TOK Connect: restaurants, disponibilités, réservations et campagnes preview via MCP sécurisé.";
const CHATGPT_MCP_SCOPES =
  "restaurants:read availability:read reservations:create reservations:cancel analytics:read credits:read campaigns:preview autopilot:plan";
const CHATGPT_INVALID_CLIENT_HELP =
  "Si ChatGPT renvoie invalid_client, recréez ou sélectionnez un client OAuth depuis le même environnement que ces URLs, puis collez le dernier secret affiché une seule fois. Une rotation invalide l'ancien secret.";

const tokConnectHeroActions: Array<{
  label: string;
  helper: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    label: "Portail développeur",
    helper: "Sandbox, OpenAPI, clients OAuth",
    href: "/tok-connect/developer",
    icon: Code2,
  },
  {
    label: "Supervision admin",
    helper: "Partenaires, scopes, quotas",
    href: "/admin/tok-connect",
    icon: ShieldCheck,
  },
  {
    label: "Consentements restaurant",
    helper: "Grants, limites, révocation",
    href: "/dashboard/tok-connect",
    icon: Table2,
  },
  {
    label: "API REST v1",
    helper: "Restaurants, menus, réservations",
    href: "#api-rest",
    icon: Code2,
  },
  {
    label: "MCP Server",
    helper: "Tools, resources, prompts",
    href: "#mcp-server",
    icon: Bot,
  },
  {
    label: "OAuth sandbox",
    helper: "Client ID, secret, token",
    href: "#deployer-mcp-api",
    icon: KeyRound,
  },
  {
    label: "Guide ChatGPT MCP",
    helper: "Champs, OAuth, captures",
    href: "#chatgpt-mcp",
    icon: Bot,
  },
  {
    label: "Webhooks signés",
    helper: "Tests, retry, signatures",
    href: "#webhooks",
    icon: Webhook,
  },
  {
    label: "Logs et quotas",
    helper: "request_id, audit, limites",
    href: "/tok-connect/developer",
    icon: Activity,
  },
  {
    label: "Autopilot avancé",
    helper: "Plans bornés, validation humaine",
    href: "#autopilot-avance",
    icon: Bot,
  },
];

const tokConnectDeploymentSteps = [
  {
    title: "Créer le client sandbox",
    action: "Ouvrir le portail développeur, créer un client sandbox, puis copier le Client ID, le secret et les scopes.",
    result: "Aucune donnée production n'est modifiée: les appels utilisent des fixtures déterministes.",
  },
  {
    title: "Brancher l'API REST",
    action:
      `Demander un token OAuth sur ${CHATGPT_OAUTH_TOKEN_URL}, puis appeler ${CHATGPT_REST_API_URL}.`,
    result: "Toutes les réponses suivent { ok, data, error, request_id, next_cursor } et les listes restent paginées.",
  },
  {
    title: "Brancher le MCP dans ChatGPT",
    action:
      `Créer un connecteur MCP avec l'URL serveur ${CHATGPT_MCP_SERVER_URL} et l'authentification OAuth.`,
    result: "ChatGPT peut appeler les tools prudents sans accès libre aux mutations sensibles.",
  },
  {
    title: "Tester de bout en bout",
    action:
      "Tester discover_restaurants (le module visuel s'ouvre dans ChatGPT), get_restaurant_details, get_real_time_availability, prepare_reservation, webhook.test, les logs et les quotas.",
    result: "Chaque appel produit un request_id traçable et les webhooks sont signés.",
  },
  {
    title: "Demander la production",
    action:
      "TOK approuve le partenaire, les scopes et les quotas; le restaurateur accorde ses restaurants; la release part par GitHub Actions.",
    result: "La production reste contrôlée: pas de push DB manuel, pas d'autopilot autonome en v1.",
  },
];

const chatGptMcpFieldRows = [
  {
    group: "Identité",
    field: "Nom",
    value: "TOK Connect",
    note: "Champ Nom dans la colonne de gauche.",
  },
  {
    group: "Identité",
    field: "Description",
    value: CHATGPT_MCP_DESCRIPTION,
    note: "Champ Description facultatif.",
  },
  {
    group: "Connexion",
    field: "URL du serveur",
    value: CHATGPT_MCP_SERVER_URL,
    note: "C'est le serveur MCP. Ne collez jamais l'URL OAuth token dans URL du serveur.",
    highlight: true,
  },
  {
    group: "Connexion",
    field: "Authentification",
    value: "OAuth",
    note: "Menu Authentification dans la colonne de gauche.",
  },
  {
    group: "OAuth avancé",
    field: "Méthode d'enregistrement",
    value: "Client OAuth défini par l'utilisateur",
    note: "Évite l'erreur Dynamic Client Registration / RFC 7591.",
    highlight: true,
  },
  {
    group: "OAuth avancé",
    field: "ID client OAuth",
    value: "Client ID créé dans /tok-connect/developer",
    note: "À copier depuis le client TOK Connect créé dans le même environnement que les URLs ci-dessus.",
  },
  {
    group: "OAuth avancé",
    field: "Secret client OAuth",
    value: "Secret affiché une seule fois lors de la création/rotation",
    note: "TOK ne le ré-affiche pas: gardez-le dans votre coffre de secrets.",
  },
  {
    group: "OAuth avancé",
    field: "Méthode d'authentification de l'endpoint du token",
    value: "client_secret_basic",
    note: "Méthode affichée dans ChatGPT. TOK Connect accepte aussi les identifiants transmis dans le corps.",
  },
  {
    group: "Périmètres",
    field: "Périmètres par défaut",
    value: CHATGPT_MCP_SCOPES,
    note: "Une seule ligne ou valeurs séparées par des espaces.",
  },
  {
    group: "Périmètres",
    field: "Périmètres de base",
    value: CHATGPT_MCP_SCOPES,
    note: "Coller la même valeur que les périmètres par défaut.",
  },
  {
    group: "Endpoints OAuth",
    field: "URL jeton",
    value: CHATGPT_OAUTH_TOKEN_URL,
    note: "C'est l'URL token. Elle ne va pas dans URL du serveur.",
    highlight: true,
  },
  {
    group: "Endpoints OAuth",
    field: "URL d'autorisation",
    value: CHATGPT_OAUTH_AUTHORIZATION_URL,
    note: "Obligatoire dans ChatGPT. Cette URL redirige vers l'URL de rappel avec un code OAuth court.",
    highlight: true,
  },
  {
    group: "Endpoints OAuth",
    field: "URL d'enregistrement",
    value: "Laisser vide",
    note: "Dynamic Client Registration n'est pas activé côté TOK Connect.",
  },
  {
    group: "Endpoints OAuth",
    field: "Base du serveur d'autorisation",
    value: "Laisser vide",
    note: "Non requis pour le token endpoint TOK Connect v1.",
  },
  {
    group: "Endpoints OAuth",
    field: "Resource",
    value: "Laisser vide",
    note: "TOK Connect ignore le paramètre resource en v1.",
  },
  {
    group: "OIDC",
    field: "OIDC activé",
    value: "Non, ne pas cocher",
    note: "Laissez URL de configuration OIDC, userinfo et périmètres OIDC vides.",
  },
  {
    group: "Référence",
    field: "API REST TOK Connect",
    value: CHATGPT_REST_API_URL,
    note: "À garder pour vos tests API/cURL. Ne pas coller comme URL serveur ChatGPT.",
  },
];

const chatGptMcpScreenshots = [
  {
    title: "Erreur à éviter",
    src: "/images/tok-connect/chatgpt-mcp-dcr-error.png",
    alt: "Erreur ChatGPT indiquant que TOK Connect ne supporte pas Dynamic Client Registration RFC 7591",
    body: "Cette erreur apparaît quand ChatGPT essaie l'inscription dynamique. Choisissez Client OAuth défini par l'utilisateur.",
  },
  {
    title: "Application et OAuth",
    src: "/images/tok-connect/chatgpt-mcp-new-app.png",
    alt: "Nouvelle application ChatGPT avec URL serveur et paramètres OAuth avancés",
    body: "Renseignez le nom, l'URL serveur MCP, OAuth, puis l'ID client et le secret TOK Connect.",
  },
  {
    title: "Périmètres et endpoints",
    src: "/images/tok-connect/chatgpt-mcp-oauth-endpoints.png",
    alt: "Champs ChatGPT pour périmètres et endpoints OAuth",
    body: "Collez les scopes dans les deux champs de périmètres, puis l'URL jeton dans URL jeton.",
  },
  {
    title: "OIDC désactivé",
    src: "/images/tok-connect/chatgpt-mcp-oidc.png",
    alt: "Section OIDC ChatGPT à laisser désactivée",
    body: "Ne cochez pas OIDC: TOK Connect v1 fonctionne en OAuth client-credentials.",
  },
];

const tokConnectCapabilityCards = [
  {
    title: "Découverte restaurant",
    body: "Chercher restaurants, profils publics, menus, prix, cuisines et contexte utile aux assistants ou widgets partenaires.",
  },
  {
    title: "Disponibilité temps réel",
    body: "Lire les créneaux compatibles avant de proposer une table, avec scopes et autorisations restaurant.",
  },
  {
    title: "Réservations confirmées",
    body: "Prévisualiser, créer avec Idempotency-Key, annuler en parcours contrôlé et notifier par webhook signé.",
  },
  {
    title: "Campagnes en preview",
    body: "Estimer les crédits, générer un brouillon de campagne et bloquer toute diffusion sans validation humaine.",
  },
  {
    title: "MCP prudent",
    body: "Exposer sept tools sûrs, des resources et des prompts pour ChatGPT ou agents IA encadrés.",
  },
  {
    title: "Observabilité",
    body: "Tracer request_id, quotas, logs API, livraisons webhook, révocations, rotations de secrets et audit admin.",
  },
  {
    title: "Autopilot avancé",
    body: "Composer un plan d'action multi-étapes, le stocker dans tok_connect_agent_runs et bloquer toute exécution avant approbation.",
  },
];

function getModeLabel(mode: TokConnectIntentPlan["mode"]) {
  if (mode === "read_only") return "Lecture";
  if (mode === "suggest") return "Suggestion";
  return "Autopilot désactivé";
}

function getActorLabel(actor: TokConnectIntentPlan["actor"]) {
  return actor === "restaurant" ? "Restaurateur" : "Client";
}

function getGoalLabel(goal: TokConnectIntentPlan["primaryGoal"]) {
  switch (goal) {
    case "discovery":
      return "Découverte";
    case "reservation":
      return "Réservation";
    case "order":
      return "Commande";
    case "loyalty":
      return "Fidélité";
    case "support":
      return "Support";
    case "campaign":
      return "Campagne";
    case "restaurant_reservations":
      return "Planning tables";
    case "restaurant_orders":
      return "Opérations commandes";
    case "restaurant_menu":
      return "Menu et photos";
    case "restaurant_marketing":
      return "Studio marketing";
    case "restaurant_analytics":
      return "Performance";
    case "restaurant_customer_engagement":
      return "CRM et actualités";
    case "restaurant_account":
      return "Compte et crédits";
    case "restaurant_consent":
      return "Consentements";
  }
}

export default function TokConnect() {
  const [draftIntent, setDraftIntent] = useState(clientIntent);
  const [draftActor, setDraftActor] = useState<TokConnectIntentPlan["actor"]>("client");
  const [submittedIntent, setSubmittedIntent] = useState(clientIntent);
  const [submittedActor, setSubmittedActor] = useState<TokConnectIntentPlan["actor"]>("client");
  const [simulationRun, setSimulationRun] = useState(1);
  const plan = useMemo(
    () => buildTokConnectIntentPlan(submittedIntent, submittedActor),
    [submittedActor, submittedIntent],
  );

  const handleSandboxActorChange = (actor: TokConnectIntentPlan["actor"]) => {
    setDraftActor(actor);
    setDraftIntent((current) => {
      const isSampleIntent = current === clientIntent || current === restaurantIntent || current.trim().length === 0;
      if (!isSampleIntent) return current;
      return actor === "restaurant" ? restaurantIntent : clientIntent;
    });
  };

  const handleSandboxSubmit = () => {
    const cleanIntent = draftIntent.trim();
    if (!cleanIntent) return;
    setSubmittedIntent(cleanIntent);
    setSubmittedActor(draftActor);
    setSimulationRun((current) => current + 1);
  };

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "TOK Connect",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "TOK Connect expose une API REST, OAuth scoped, webhooks signés et MCP prudent pour restaurants.",
      url: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
      provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
      areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
    }),
    [],
  );

  useSeoMeta({
    title: "TOK Connect : API, OAuth, Webhooks et MCP pour restaurants | TOK",
    description:
      "TOK Connect permet aux partenaires d'intégrer restaurants, menus, disponibilités, réservations confirmées, webhooks et tools MCP prudents.",
    path: PAGE_PATH,
    image: "/fond3.png",
    jsonLd,
  });

  return (
    <main className="bg-white text-slate-950">
      <section className="relative isolate overflow-hidden border-b bg-slate-950 text-white">
        <div
          className="absolute inset-0 -z-10 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(2,6,23,0.96), rgba(15,23,42,0.84), rgba(15,23,42,0.58)), url('/fond3.png')",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-8 px-4 pb-12 pt-24 md:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-center lg:px-12">
          <div className="space-y-7">
            <div>
              <h1 className="text-5xl font-black leading-[0.96] tracking-normal md:text-7xl">TOK Connect</h1>
              <p className="mt-5 max-w-2xl text-2xl font-semibold leading-tight text-orange-100 md:text-3xl">
                API réelle, MCP prudent, réservations confirmées.
              </p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 md:text-lg">
                Connectez TOK aux hôtels, conciergeries, CRM, apps locales et assistants IA. Le v1 privilégie les
                lectures, previews et réservations confirmées; les actions autonomes restent désactivées.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <Link to="/tok-connect/developer">
                  Ouvrir le portail
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/28 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <a href="mailto:contact@thetok.ch?subject=TOK%20Connect%20-%20partenariat">
                  Demander la production
                </a>
              </Button>
            </div>

            <div className="max-w-3xl">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-white/60">
                Accès rapides TOK Connect
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {tokConnectHeroActions.map((action) => (
                  <HeroActionButton key={`${action.label}-${action.href}`} action={action} />
                ))}
              </div>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              <HeroStat value="9" label="endpoints v1" />
              <HeroStat value="7" label="tools MCP sûrs" />
              <HeroStat value="0" label="autopilot prod" />
            </div>
          </div>

          <IntentConsole
            intent={draftIntent}
            selectedActor={draftActor}
            submittedIntent={submittedIntent}
            simulationRun={simulationRun}
            onActorChange={handleSandboxActorChange}
            onIntentChange={setDraftIntent}
            onSubmit={handleSandboxSubmit}
            plan={plan}
          />
        </div>
      </section>

      <section className="border-b bg-slate-50 px-4 py-14 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          {[
            { icon: KeyRound, title: "OAuth scoped", body: "Client-credentials, secrets hashés, tokens courts, rotation et révocation." },
            { icon: Code2, title: "API REST v1", body: "Restaurants, menus, disponibilité, previews, réservations et crédits." },
            { icon: Bot, title: "MCP prudent", body: "Tools, resources et prompts limités aux lectures et suggestions validables." },
            { icon: Webhook, title: "Webhooks signés", body: "Livraisons sortantes horodatées, signées et auditables." },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-white p-5 shadow-sm">
              <Icon className="h-7 w-7 text-orange-600" />
              <h2 className="mt-5 text-xl font-black">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="api-rest" className="scroll-mt-24 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Code2 className="h-7 w-7 text-orange-600" />
              <h2 className="text-3xl font-black md:text-4xl">API REST versionnée</h2>
            </div>
            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <div className="grid bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white md:grid-cols-[92px_minmax(0,1fr)_1.1fr]">
                <span>Méthode</span>
                <span>Endpoint</span>
                <span>Usage</span>
              </div>
              {tokConnectCoreEndpoints.map((endpoint) => (
                <div
                  key={`${endpoint.method}-${endpoint.path}`}
                  className="grid gap-2 border-t p-4 text-sm md:grid-cols-[92px_minmax(0,1fr)_1.1fr]"
                >
                  <span className="font-black text-orange-700">{endpoint.method}</span>
                  <code className="min-w-0 break-words rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                    {endpoint.path}
                  </code>
                  <span className="leading-6 text-slate-600">{endpoint.purpose}</span>
                </div>
              ))}
            </div>
          </div>

          <div id="mcp-server" className="scroll-mt-24 space-y-4">
            <h3 className="text-xl font-black">Tools MCP v1</h3>
            {tokConnectMcpTools.map((tool) => (
              <article key={tool.name} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <code className="min-w-0 break-words text-sm font-black text-slate-900">{tool.name}</code>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {getModeLabel(tool.execution)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{tool.purpose}</p>
                <p className="mt-2 text-xs font-semibold text-orange-700">{tool.scope}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="webhooks" className="scroll-mt-24 border-y bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <CatalogPanel title="Webhooks sortants" icon={Webhook} items={tokConnectPartnerWebhooks.map((item) => ({
            title: item.event,
            body: item.purpose,
            meta: item.delivery,
          }))} />
          <CatalogPanel title="Contrôles sécurité" icon={ShieldCheck} items={tokConnectSecurityControls.map((item) => ({
            title: item.title,
            body: item.detail,
            meta: "v1",
          }))} />
        </div>
      </section>

      <section id="portail-developpeur" className="scroll-mt-24 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.86fr_1.14fr]">
          <div>
            <h2 className="text-3xl font-black md:text-4xl">Portail développeur</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Le portail authentifié centralise sandbox, clients OAuth, logs, quotas, webhooks, OpenAPI et exemples MCP.
            </p>
            <Button asChild className="mt-6 bg-orange-500 text-white hover:bg-orange-600">
              <Link to="/tok-connect/developer">Accéder au portail</Link>
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {tokConnectDeveloperPortalModules.map((module) => (
              <div key={module} className="rounded-lg border bg-white p-4 text-sm font-bold shadow-sm">{module}</div>
            ))}
          </div>
        </div>
      </section>

      <section id="chatgpt-mcp" className="scroll-mt-24 border-y bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/35 bg-orange-500/14 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-orange-100">
                <Bot className="h-4 w-4" />
                ChatGPT MCP en 3 minutes
              </div>
              <div>
                <h2 className="text-3xl font-black leading-tight md:text-5xl">
                  Créer l'application MCP sans se tromper de champ.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 md:text-base">
                  Les captures ci-dessous correspondent à l'écran ChatGPT. Les valeurs TOK à coller sont alignées avec
                  le champ ChatGPT exact pour éviter la confusion entre serveur MCP, token OAuth et API REST.
                </p>
              </div>
              <div className="rounded-lg border border-red-300/30 bg-red-500/12 p-4">
                <p className="text-sm font-black text-red-100">Erreur Dynamic Client Registration / RFC 7591</p>
                <p className="mt-2 text-sm leading-6 text-red-50/78">
                  Si ChatGPT affiche cette erreur, ouvrez Paramètres OAuth avancés et choisissez
                  <span className="font-black text-white"> Client OAuth défini par l'utilisateur</span>. Ne collez jamais
                  l'URL OAuth token dans URL du serveur.
                </p>
              </div>
              <div className="rounded-lg border border-amber-300/35 bg-amber-400/12 p-4">
                <p className="text-sm font-black text-amber-100">Erreur invalid_client</p>
                <p className="mt-2 text-sm leading-6 text-amber-50/82">{CHATGPT_INVALID_CLIENT_HELP}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniValue label="Serveur MCP" value={CHATGPT_MCP_SERVER_URL} />
                <MiniValue label="URL autorisation" value={CHATGPT_OAUTH_AUTHORIZATION_URL} />
                <MiniValue label="URL jeton" value={CHATGPT_OAUTH_TOKEN_URL} />
                <MiniValue label="API REST" value={CHATGPT_REST_API_URL} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {chatGptMcpScreenshots.map((screenshot) => (
                <figure key={screenshot.src} className="overflow-hidden rounded-lg border border-white/12 bg-white/8">
                  <div className="border-b border-white/10 bg-black/20 px-4 py-3">
                    <figcaption className="text-sm font-black">{screenshot.title}</figcaption>
                    <p className="mt-1 text-xs leading-5 text-white/58">{screenshot.body}</p>
                  </div>
                  <img
                    src={screenshot.src}
                    alt={screenshot.alt}
                    loading="lazy"
                    className="h-auto w-full bg-white object-contain"
                  />
                </figure>
              ))}
            </div>
          </div>

          <div className="mt-10 overflow-hidden rounded-lg border border-white/12 bg-white text-slate-950 shadow-2xl">
            <div className="grid gap-3 bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white md:grid-cols-[140px_minmax(180px,0.78fr)_minmax(0,1.2fr)_minmax(220px,0.9fr)]">
              <span>Section</span>
              <span>Champ ChatGPT</span>
              <span>Valeur TOK à coller</span>
              <span>Note</span>
            </div>
            <div className="divide-y divide-slate-200">
              {chatGptMcpFieldRows.map((row) => (
                <ChatGptFieldRow key={`${row.group}-${row.field}`} row={row} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="deployer-mcp-api" className="scroll-mt-24 border-y bg-white px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <div className="flex items-center gap-3">
              <KeyRound className="h-7 w-7 text-orange-600" />
              <h2 className="text-3xl font-black md:text-4xl">Déployer MCP/API en 5 actions</h2>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
              Le chemin le plus simple: sandbox d'abord, OAuth ensuite, MCP/API branchés, tests signés, puis production
              uniquement après validation TOK et consentement restaurateur.
            </p>

            <div className="mt-8 space-y-3">
              {tokConnectDeploymentSteps.map((step, index) => (
                <article key={step.title} className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-[44px_minmax(0,1fr)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500 text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <span>
                    <h3 className="text-base font-black">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{step.action}</p>
                    <p className="mt-2 text-xs font-bold text-orange-700">{step.result}</p>
                  </span>
                </article>
              ))}
            </div>
          </div>

          <div id="autopilot-avance" className="scroll-mt-24">
            <h3 className="text-2xl font-black">Ce que TOK Connect sait faire</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {tokConnectCapabilityCards.map((capability) => (
                <article key={capability.title} className="rounded-lg border bg-white p-5 shadow-sm">
                  <h4 className="text-lg font-black">{capability.title}</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{capability.body}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-5">
              <h4 className="text-lg font-black text-orange-800">URLs à utiliser</h4>
              <div className="mt-4 space-y-3 text-sm">
                <EndpointLine label="OAuth token" value={CHATGPT_OAUTH_TOKEN_URL} />
                <EndpointLine label="OAuth autorisation" value={CHATGPT_OAUTH_AUTHORIZATION_URL} />
                <EndpointLine label="API REST" value={CHATGPT_REST_API_URL} />
                <EndpointLine label="MCP Server" value={CHATGPT_MCP_SERVER_URL} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <CatalogPanel dark title="Resources & prompts MCP" icon={Bot} items={[
            ...tokConnectMcpResources.map((item) => ({ title: item.uri, body: item.purpose, meta: item.scope })),
            ...tokConnectMcpPrompts.map((item) => ({ title: item.name, body: item.purpose, meta: item.mode })),
          ]} />
          <CatalogPanel dark title="Offres commerciales" icon={Table2} items={tokConnectPricingTiers.map((tier) => ({
            title: `${tier.name} · ${tier.price}`,
            body: tier.audience,
            meta: tier.commercialModel,
          }))} />
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black md:text-4xl">Feuille de route v1</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {tokConnectRoadmap.map((step) => (
              <article key={step.step} className="rounded-lg border bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">
                  {step.step}
                </span>
                <h3 className="mt-4 text-lg font-black">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{step.outcome}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-orange-500 px-4 py-14 text-white md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black">TOK Connect est prêt pour les intégrations v1.</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-white/85">
              Sandbox immédiate, production sur validation admin et consentement restaurateur.
            </p>
          </div>
          <Button asChild size="lg" className="bg-white text-orange-700 hover:bg-orange-50">
            <Link to="/tok-connect/developer">Créer un client sandbox</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
      <p className="text-3xl font-black text-orange-200">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
    </div>
  );
}

function HeroActionButton({
  action,
}: {
  action: {
    label: string;
    helper: string;
    href: string;
    icon: LucideIcon;
  };
}) {
  const Icon = action.icon;
  const className =
    "group flex min-h-16 items-center gap-3 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-left text-white backdrop-blur transition hover:border-orange-300/70 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300";
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-500/20 text-orange-100 transition group-hover:bg-orange-500 group-hover:text-white">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black leading-5">{action.label}</span>
        <span className="mt-0.5 block text-xs font-semibold leading-4 text-white/60">{action.helper}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-orange-100" />
    </>
  );

  if (action.href.startsWith("/")) {
    return (
      <Link to={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <a href={action.href} className={className}>
      {content}
    </a>
  );
}

function EndpointLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-md bg-white p-3 sm:grid-cols-[132px_minmax(0,1fr)]">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-orange-700">{label}</span>
      <code className="min-w-0 break-words text-xs font-semibold text-slate-800">{value}</code>
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/12 bg-white/8 p-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-100">{label}</p>
      <code className="mt-2 block min-w-0 break-all text-xs font-semibold leading-5 text-white/78">{value}</code>
    </div>
  );
}

function ChatGptFieldRow({ row }: { row: (typeof chatGptMcpFieldRows)[number] }) {
  return (
    <div
      className={
        row.highlight
          ? "grid gap-3 bg-orange-50 p-4 text-sm md:grid-cols-[140px_minmax(180px,0.78fr)_minmax(0,1.2fr)_minmax(220px,0.9fr)] md:items-center"
          : "grid gap-3 p-4 text-sm md:grid-cols-[140px_minmax(180px,0.78fr)_minmax(0,1.2fr)_minmax(220px,0.9fr)] md:items-center"
      }
    >
      <span className="text-xs font-black uppercase tracking-[0.12em] text-orange-700">{row.group}</span>
      <span className="font-black text-slate-950">{row.field}</span>
      <code className="min-w-0 break-words rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold leading-5 text-white">
        {row.value}
      </code>
      <span className="text-xs font-semibold leading-5 text-slate-600">{row.note}</span>
    </div>
  );
}

function IntentConsole({
  intent,
  selectedActor,
  submittedIntent,
  simulationRun,
  onActorChange,
  onIntentChange,
  onSubmit,
  plan,
}: {
  intent: string;
  selectedActor: TokConnectIntentPlan["actor"];
  submittedIntent: string;
  simulationRun: number;
  onActorChange: (actor: TokConnectIntentPlan["actor"]) => void;
  onIntentChange: (intent: string) => void;
  onSubmit: () => void;
  plan: TokConnectIntentPlan;
}) {
  return (
    <div className="rounded-lg border border-white/18 bg-white p-5 text-slate-950 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-orange-600">Intent sandbox</p>
          <h2 className="mt-1 text-2xl font-black">Plan généré</h2>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={selectedActor === "client" ? "default" : "outline"}
            size="sm"
            className={selectedActor === "client" ? "bg-slate-950 text-white hover:bg-slate-800" : undefined}
            onClick={() => onActorChange("client")}
          >
            Client
          </Button>
          <Button
            type="button"
            variant={selectedActor === "restaurant" ? "default" : "outline"}
            size="sm"
            className={selectedActor === "restaurant" ? "bg-slate-950 text-white hover:bg-slate-800" : undefined}
            onClick={() => onActorChange("restaurant")}
          >
            Restaurant
          </Button>
        </div>
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Textarea
          value={intent}
          onChange={(event) => onIntentChange(event.target.value)}
          className="min-h-28 resize-none border-slate-200 text-sm leading-6"
          aria-label="Demande à simuler dans TOK Connect"
          placeholder="Exemple: trouve une table, prépare une campagne, analyse mes commandes, explique mes crédits..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold leading-5 text-slate-500">
            Simule une demande libre: réservation, commande, menu, crédits, campagne, CRM, support ou performance.
          </p>
          <Button type="submit" className="bg-orange-500 text-white hover:bg-orange-600">
            <Send className="mr-2 h-4 w-4" />
            Envoyer
          </Button>
        </div>
      </form>

      <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-900">
        Demande analysée comme <span className="font-black">{getActorLabel(plan.actor).toLowerCase()}</span>:
        <span className="ml-1 text-slate-700">{submittedIntent}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric icon={Activity} label="Acteur" value={getActorLabel(plan.actor)} />
        <Metric icon={LockKeyhole} label="Mode" value={getModeLabel(plan.mode)} />
        <Metric icon={ShieldCheck} label="Objectif" value={getGoalLabel(plan.primaryGoal)} />
      </div>

      {plan.limits ? (
        <div className="mt-4 grid gap-3 rounded-lg bg-slate-950 p-4 text-white sm:grid-cols-3">
          <MetricDark label="Couverts max" value={String(plan.limits.maxPartySize)} />
          <MetricDark label="Réservations/j" value={plan.limits.maxDailyReservations === 0 ? "quota grant" : String(plan.limits.maxDailyReservations)} />
          <MetricDark label="Validation" value={plan.limits.humanApprovalRequired ? "requise" : "non"} />
        </div>
      ) : null}

      <div key={simulationRun} className="mt-5 space-y-3">
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Étapes</h3>
        {plan.steps.map((step, index) => (
          <div
            key={`${simulationRun}-${step.title}`}
            className="tok-plan-step-enter grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border bg-slate-50 p-3"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">
              {index + 1}
            </span>
            <span>
              <span className="block font-black">{step.title}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">{step.detail}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border bg-orange-50 p-4">
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-orange-700">Garde-fous</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {plan.guardrails.map((guardrail) => (
            <li key={guardrail} className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
              <span>{guardrail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <Icon className="h-4 w-4 text-orange-600" />
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black capitalize">{value}</p>
    </div>
  );
}

function MetricDark({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/50">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function CatalogPanel({
  title,
  icon: Icon,
  items,
  dark = false,
}: {
  title: string;
  icon: LucideIcon;
  items: Array<{ title: string; body: string; meta: string }>;
  dark?: boolean;
}) {
  return (
    <article className={dark ? "rounded-lg border border-white/12 bg-white/6 p-5" : "rounded-lg border bg-white p-5 shadow-sm"}>
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-orange-500" />
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      <div className="mt-5 space-y-3">
        {items.slice(0, 8).map((item) => (
          <div key={`${title}-${item.title}`} className={dark ? "rounded-lg bg-white/8 p-4" : "rounded-lg bg-slate-50 p-4"}>
            <p className="font-black">{item.title}</p>
            <p className={dark ? "mt-2 text-sm leading-6 text-white/70" : "mt-2 text-sm leading-6 text-slate-600"}>{item.body}</p>
            <p className="mt-2 text-xs font-semibold text-orange-500">{item.meta}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
