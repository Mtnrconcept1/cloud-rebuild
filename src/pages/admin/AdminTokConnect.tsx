import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Store,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken } from "@/lib/session";

export const ADMIN_TOK_CONNECT_LOG_LIMIT = 100;
const MCP_URL = "https://www.thetok.ch/mcp";

type RestaurantOverview = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_city: string | null;
  restaurant_address: string | null;
  owner_name: string;
  owner_email: string | null;
  mcp_enabled: boolean;
  restaurant_status: string | null;
  restaurant_active: boolean;
};

type AgentOverview = {
  agent_id: string;
  agent_name: string;
  partner_name: string;
  status: string;
  environment: string | null;
  last_used_at: string | null;
  allowed_scopes: string[];
};

type RunOverview = {
  run_id: string;
  agent_name: string;
  partner_name: string;
  restaurant_name: string | null;
  tool_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ActivityOverview = {
  request_id: string;
  agent_name: string;
  partner_name: string;
  restaurant_name: string | null;
  route: string | null;
  status_code: number | null;
  error_code: string | null;
  created_at: string | null;
};

type TechnicalOverview = {
  partners: Array<{
    partner_id: string;
    partner_name: string;
    status: string;
    environment: string;
  }>;
  agents: Array<{
    agent_id: string;
    public_client_id: string;
    agent_name: string;
    partner_id: string;
  }>;
};

type AdminOverview = {
  restaurants: RestaurantOverview[];
  agents: AgentOverview[];
  runs: RunOverview[];
  activity: ActivityOverview[];
  technical: TechnicalOverview;
};

type TokConnectEnvelope<T> = {
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
};

const EMPTY_OVERVIEW: AdminOverview = {
  restaurants: [],
  agents: [],
  runs: [],
  activity: [],
  technical: { partners: [], agents: [] },
};

function humanDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" });
}

function humanStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "active" || normalized === "completed" || normalized === "success") return "Actif";
  if (normalized === "pending") return "En attente";
  if (normalized === "suspended") return "Suspendu";
  if (normalized === "revoked") return "Révoqué";
  if (normalized === "failed" || normalized === "failure") return "Échec";
  return value || "Inconnu";
}

async function callTokConnectAdmin<T>(body: Record<string, unknown>) {
  const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/tok-connect-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TokConnectEnvelope<T>;
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.error?.message || "Action TOK Connect impossible.");
  }
  return payload.data;
}

export default function AdminTokConnect() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await callTokConnectAdmin<AdminOverview>({ action: "admin-overview" });
      setOverview(next);
      setSelectedRestaurantId((current) => {
        if (current && next.restaurants.some((restaurant) => restaurant.restaurant_id === current)) return current;
        return next.restaurants[0]?.restaurant_id || "";
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Chargement TOK Connect impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRestaurants = useMemo(() => {
    const needle = restaurantSearch.trim().toLowerCase();
    if (!needle) return overview.restaurants;
    return overview.restaurants.filter((restaurant) => [
      restaurant.restaurant_name,
      restaurant.restaurant_city,
      restaurant.restaurant_address,
      restaurant.owner_name,
      restaurant.owner_email,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)));
  }, [overview.restaurants, restaurantSearch]);

  const selectedRestaurant = overview.restaurants.find(
    (restaurant) => restaurant.restaurant_id === selectedRestaurantId,
  ) || filteredRestaurants[0] || null;

  const enabledRestaurants = overview.restaurants.filter((restaurant) => restaurant.mcp_enabled).length;
  const activeAgents = overview.agents.filter((agent) => agent.status === "active").length;
  const recentErrors = overview.activity.filter((entry) => (entry.status_code || 0) >= 400).length;

  async function setRestaurantMcpAccess(enabled: boolean) {
    if (!selectedRestaurant) return;
    setBusy(true);
    try {
      await callTokConnectAdmin({
        action: "set-restaurant-mcp-access",
        restaurant_id: selectedRestaurant.restaurant_id,
        enabled,
      });
      toast({
        title: enabled ? "Accès MCP autorisé" : "Accès MCP révoqué",
        description: enabled
          ? `${selectedRestaurant.restaurant_name} peut à nouveau être utilisé par TOK Connect.`
          : `${selectedRestaurant.restaurant_name} n’est plus accessible depuis le MCP.`,
      });
      await load();
    } catch (nextError) {
      toast({
        title: "Modification impossible",
        description: nextError instanceof Error ? nextError.message : "Impossible de modifier l’accès MCP.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyMcpUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Copie impossible", description: MCP_URL, variant: "destructive" });
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <ShieldCheck className="h-4 w-4" />Administration
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Supervision TOK Connect</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
            Gérez les restaurants accessibles depuis ChatGPT avec des noms compréhensibles. Les identifiants techniques restent cachés sauf dans le diagnostic avancé.
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualiser
        </Button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Store className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black">{enabledRestaurants}/{overview.restaurants.length}</p><p className="text-sm text-muted-foreground">Restaurants autorisés</p></div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black">{activeAgents}</p><p className="text-sm text-muted-foreground">Agents / applications actifs</p></div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Activity className="h-5 w-5" /></div>
            <div><p className="text-2xl font-black">{recentErrors}</p><p className="text-sm text-muted-foreground">Erreurs sur l’activité récente</p></div>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Connexion ChatGPT</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="font-bold">Parcours actuel : URL MCP → OAuth → connexion TOK → module</p>
            <p className="mt-1 text-sm text-muted-foreground">Aucun Client ID, secret, endpoint OAuth ou paramétrage avancé n’est à recopier manuellement.</p>
            <code className="mt-3 block w-fit max-w-full overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{MCP_URL}</code>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copyMcpUrl()}>
            {copied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
            {copied ? "Copié" : "Copier l’URL MCP"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" />Restaurants autorisés au MCP</CardTitle>
          <p className="text-sm text-muted-foreground">Choisissez simplement un restaurant puis autorisez ou révoquez son accès. La modification est appliquée à la recherche, aux fiches et aux actions MCP.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Rechercher un restaurant</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={restaurantSearch}
                  onChange={(event) => setRestaurantSearch(event.target.value)}
                  placeholder="Nom, ville, adresse ou propriétaire…"
                  className="h-11 rounded-xl pl-9"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Restaurant sélectionné</span>
              <select
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold"
                value={selectedRestaurant?.restaurant_id || ""}
                onChange={(event) => setSelectedRestaurantId(event.target.value)}
                disabled={loading || filteredRestaurants.length === 0}
              >
                {filteredRestaurants.map((restaurant) => (
                  <option key={restaurant.restaurant_id} value={restaurant.restaurant_id}>
                    {restaurant.restaurant_name}{restaurant.restaurant_city ? ` — ${restaurant.restaurant_city}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedRestaurant ? (
            <div className="grid gap-4 rounded-2xl border bg-muted/20 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black">{selectedRestaurant.restaurant_name}</h3>
                  <Badge variant={selectedRestaurant.mcp_enabled ? "default" : "secondary"} className="rounded-full">
                    {selectedRestaurant.mcp_enabled ? "Autorisé" : "Révoqué"}
                  </Badge>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Lieu</p><p className="mt-1 font-semibold">{[selectedRestaurant.restaurant_address, selectedRestaurant.restaurant_city].filter(Boolean).join(", ") || "Adresse non renseignée"}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Propriétaire</p><p className="mt-1 font-semibold">{selectedRestaurant.owner_name}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contact</p><p className="mt-1 font-semibold">{selectedRestaurant.owner_email || "Email non disponible"}</p></div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={busy || selectedRestaurant.mcp_enabled}
                  onClick={() => void setRestaurantMcpAccess(true)}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Autoriser l’accès MCP
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl"
                  disabled={busy || !selectedRestaurant.mcp_enabled}
                  onClick={() => void setRestaurantMcpAccess(false)}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                  Révoquer l’accès MCP
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun restaurant ne correspond à la recherche.</p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Agents et applications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {overview.agents.length ? overview.agents.slice(0, 12).map((agent) => (
              <div key={agent.agent_id} className="flex items-center justify-between gap-4 rounded-2xl border p-4">
                <div className="min-w-0">
                  <p className="truncate font-bold">{agent.agent_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{agent.partner_name} · {agent.environment || "Production"}</p>
                </div>
                <div className="text-right"><Badge variant="outline" className="rounded-full">{humanStatus(agent.status)}</Badge><p className="mt-1 text-xs text-muted-foreground">{agent.last_used_at ? `Vu ${humanDate(agent.last_used_at)}` : "Pas encore utilisé"}</p></div>
              </div>
            )) : <p className="text-sm text-muted-foreground">Aucun agent partenaire enregistré.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Activité récente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {overview.activity.length ? overview.activity.slice(0, 12).map((entry) => (
              <div key={entry.request_id} className="grid gap-2 rounded-2xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0"><p className="truncate font-bold">{entry.agent_name}</p><p className="truncate text-sm text-muted-foreground">{entry.restaurant_name || "Catalogue TOK"} · {entry.route || "Action MCP"}</p></div>
                <div className="text-right"><Badge variant={(entry.status_code || 0) >= 400 ? "destructive" : "outline"} className="rounded-full">{entry.status_code || "OK"}</Badge><p className="mt-1 text-xs text-muted-foreground">{humanDate(entry.created_at)}</p></div>
              </div>
            )) : <p className="text-sm text-muted-foreground">Aucune activité récente.</p>}
          </CardContent>
        </Card>
      </section>

      <details className="rounded-3xl border bg-muted/10 p-5">
        <summary className="cursor-pointer font-bold">Diagnostic technique</summary>
        <p className="mt-2 text-sm text-muted-foreground">Réservé au dépannage : les identifiants internes ne sont jamais nécessaires pour autoriser un restaurant.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <p className="mb-2 font-bold text-white">Partenaires internes</p>
            {overview.technical.partners.map((partner) => <p key={partner.partner_id} className="break-all">{partner.partner_name} · {partner.status} · {partner.partner_id}</p>)}
          </div>
          <div className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <p className="mb-2 font-bold text-white">Agents internes</p>
            {overview.technical.agents.map((agent) => <p key={agent.agent_id} className="break-all">{agent.agent_name} · {agent.public_client_id || agent.agent_id}</p>)}
          </div>
        </div>
      </details>
    </main>
  );
}
