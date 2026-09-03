import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, Check, Clipboard, KeyRound, Network, ShieldAlert, ShieldCheck, ShieldX, SlidersHorizontal, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken } from "@/lib/session";

export const ADMIN_TOK_CONNECT_LOG_LIMIT = 100;

type TokConnectRow = Record<string, unknown>;

type TokConnectQueryBuilder = {
  select: (columns: string) => TokConnectQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => TokConnectQueryBuilder;
  limit: (count: number) => Promise<{ data: TokConnectRow[] | null; error: { message: string } | null }>;
};

type TokConnectSupabase = {
  from: (table: string) => TokConnectQueryBuilder;
};

type AdminTokConnectState = {
  partners: TokConnectRow[];
  clients: TokConnectRow[];
  requests: TokConnectRow[];
  deliveries: TokConnectRow[];
  grants: TokConnectRow[];
  agentRuns: TokConnectRow[];
};

const emptyState: AdminTokConnectState = {
  partners: [],
  clients: [],
  requests: [],
  deliveries: [],
  grants: [],
  agentRuns: [],
};

type TokConnectEnvelope<TData> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  request_id: string;
};

type GrantFormState = {
  partner_id: string;
  restaurant_id: string;
  allowed_scopes: string;
  status: "pending" | "active" | "suspended" | "revoked";
  allow_mcp: boolean;
  max_daily_reservations: string;
  max_party_size: string;
  expires_at: string;
};

const defaultGrantForm: GrantFormState = {
  partner_id: "",
  restaurant_id: "",
  allowed_scopes: "restaurants:read availability:read reservations:create reservations:cancel analytics:read campaigns:preview autopilot:plan",
  status: "pending",
  allow_mcp: false,
  max_daily_reservations: "25",
  max_party_size: "8",
  expires_at: "",
};

type ChatGptMcpSetupItem = {
  step: number;
  field: string;
  value: string;
  note: string;
  copyable?: boolean;
};

const DEFAULT_CHATGPT_FUNCTIONS_BASE_URL = "https://www.thetok.ch/functions/v1";
const LOCAL_SUPABASE_URL_PATTERN = /(?:localhost|127\.0\.0\.1)/i;

function getChatGptFunctionsBaseUrl() {
  const supabaseUrl = SUPABASE_URL.replace(/\/+$/, "");
  if (!supabaseUrl || LOCAL_SUPABASE_URL_PATTERN.test(supabaseUrl)) return DEFAULT_CHATGPT_FUNCTIONS_BASE_URL;
  return `${supabaseUrl}/functions/v1`;
}

const CHATGPT_FUNCTIONS_BASE_URL = getChatGptFunctionsBaseUrl();
const CHATGPT_MCP_SERVER_URL = "https://www.thetok.ch/mcp";
const CHATGPT_OAUTH_AUTHORIZATION_URL = `${CHATGPT_FUNCTIONS_BASE_URL}/tok-connect-oauth/authorize`;
const CHATGPT_OAUTH_TOKEN_URL = `${CHATGPT_FUNCTIONS_BASE_URL}/tok-connect-oauth`;
const CHATGPT_MCP_DESCRIPTION = "TOK Connect: restaurants, disponibilités, réservations et campagnes preview via MCP sécurisé.";
const CHATGPT_MCP_FALLBACK_SCOPES = "restaurants:read availability:read reservations:create reservations:cancel analytics:read credits:read campaigns:preview autopilot:plan";
const CHATGPT_INVALID_CLIENT_HELP =
  "Si ChatGPT renvoie invalid_client, le Client ID ou le secret ne correspond pas à l'endpoint OAuth. Utilisez un client créé dans le même environnement que ces URLs, puis copiez le dernier secret affiché une seule fois.";

function getStringValue(row: TokConnectRow | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "string" ? value : "";
}

function getNumberString(row: TokConnectRow | undefined, key: string, fallback: string) {
  const value = row?.[key];
  return typeof value === "number" ? String(value) : fallback;
}

function stringifyScopes(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").join(" ") : "";
}

function getMetadataNumber(row: TokConnectRow | undefined, key: string, fallback: string) {
  const metadata = row?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return fallback;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : fallback;
}

async function callTokConnectAdminAction(body: Record<string, unknown>) {
  const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/tok-connect-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TokConnectEnvelope<Record<string, unknown>>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "Action admin TOK Connect impossible.");
  }
  return payload.data;
}

async function loadAdminTokConnectState(): Promise<AdminTokConnectState> {
  const supabase = getSupabase() as unknown as TokConnectSupabase;
  const [partners, clients, requests, deliveries, grants, agentRuns] = await Promise.all([
    supabase.from("tok_connect_partners").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("tok_connect_clients").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("tok_connect_api_requests").select("*").order("created_at", { ascending: false }).limit(ADMIN_TOK_CONNECT_LOG_LIMIT),
    supabase.from("tok_connect_webhook_deliveries").select("*").order("created_at", { ascending: false }).limit(ADMIN_TOK_CONNECT_LOG_LIMIT),
    supabase.from("tok_connect_restaurant_grants").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("tok_connect_agent_runs").select("*").order("created_at", { ascending: false }).limit(ADMIN_TOK_CONNECT_LOG_LIMIT),
  ]);

  const firstError = [partners.error, clients.error, requests.error, deliveries.error, grants.error, agentRuns.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  return {
    partners: partners.data || [],
    clients: clients.data || [],
    requests: requests.data || [],
    deliveries: deliveries.data || [],
    grants: grants.data || [],
    agentRuns: agentRuns.data || [],
  };
}

export default function AdminTokConnect() {
  const { toast } = useToast();
  const [state, setState] = useState<AdminTokConnectState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedChatGptField, setCopiedChatGptField] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedClientUuid, setSelectedClientUuid] = useState("");
  const [selectedAgentRunId, setSelectedAgentRunId] = useState("");
  const [clientScopesInput, setClientScopesInput] = useState("restaurants:read availability:read");
  const [clientTtlSeconds, setClientTtlSeconds] = useState("900");
  const [clientQuotaPerMinute, setClientQuotaPerMinute] = useState("240");
  const [grantForm, setGrantForm] = useState<GrantFormState>(defaultGrantForm);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setState(await loadAdminTokConnectState());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Chargement TOK Connect impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedPartnerId) {
      const firstPartnerId = getStringValue(state.partners[0], "id");
      if (firstPartnerId) setSelectedPartnerId(firstPartnerId);
    }
    if (!selectedClientUuid) {
      const firstClientUuid = getStringValue(state.clients[0], "id");
      if (firstClientUuid) setSelectedClientUuid(firstClientUuid);
    }
    if (!selectedAgentRunId) {
      const firstAgentRunId = getStringValue(state.agentRuns[0], "id");
      if (firstAgentRunId) setSelectedAgentRunId(firstAgentRunId);
    }
  }, [selectedAgentRunId, selectedClientUuid, selectedPartnerId, state.agentRuns, state.clients, state.partners]);

  const metrics = useMemo(() => [
    { label: "Partenaires", value: state.partners.length, icon: Network },
    { label: "Requêtes API", value: state.requests.length, icon: Activity },
    { label: "Grants restaurants", value: state.grants.length, icon: KeyRound },
    { label: "Livraisons webhook", value: state.deliveries.length, icon: Webhook },
    { label: "Runs Autopilot", value: state.agentRuns.length, icon: Bot },
  ], [state]);

  const selectedClient = useMemo(
    () => state.clients.find((client) => getStringValue(client, "id") === selectedClientUuid),
    [selectedClientUuid, state.clients],
  );

  useEffect(() => {
    if (!selectedClient) return;
    setClientScopesInput(stringifyScopes(selectedClient.allowed_scopes) || "restaurants:read availability:read");
    setClientTtlSeconds(getNumberString(selectedClient, "token_ttl_seconds", "900"));
    setClientQuotaPerMinute(getMetadataNumber(selectedClient, "tok_connect_quota_per_minute", "240"));
  }, [selectedClient]);

  useEffect(() => {
    setGrantForm((current) => ({
      ...current,
      partner_id: current.partner_id || selectedPartnerId,
    }));
  }, [selectedPartnerId]);

  const selectedClientPublicId = getStringValue(selectedClient, "client_id") || "Sélectionnez un client OAuth actif.";
  const selectedClientScopes = stringifyScopes(selectedClient?.allowed_scopes) || clientScopesInput || CHATGPT_MCP_FALLBACK_SCOPES;

  const chatGptMcpSetupItems = useMemo<ChatGptMcpSetupItem[]>(() => [
    {
      step: 1,
      field: "Nom",
      value: "tok",
      note: "Champ Nom dans la colonne de gauche.",
      copyable: true,
    },
    {
      step: 2,
      field: "Description",
      value: CHATGPT_MCP_DESCRIPTION,
      note: "Champ Description facultatif.",
      copyable: true,
    },
    {
      step: 3,
      field: "Connexion - URL du serveur",
      value: CHATGPT_MCP_SERVER_URL,
      note: "Utiliser le serveur MCP du même environnement que le client OAuth sélectionné.",
      copyable: true,
    },
    {
      step: 4,
      field: "Authentification",
      value: "OAuth",
      note: "Choisir OAuth dans le menu.",
      copyable: true,
    },
    {
      step: 5,
      field: "Méthode d'enregistrement",
      value: "Client OAuth défini par l'utilisateur",
      note: "Paramètres OAuth avancés > Enregistrement client.",
      copyable: true,
    },
    {
      step: 6,
      field: "ID client OAuth",
      value: selectedClientPublicId,
      note: "Utiliser le client OAuth sélectionné dans tok_connect_clients pour ce même environnement.",
      copyable: Boolean(getStringValue(selectedClient, "client_id")),
    },
    {
      step: 7,
      field: "Secret client OAuth",
      value: "Secret affiché une seule fois lors de la création ou rotation du client OAuth.",
      note: "Non copiable depuis l'admin: TOK ne stocke jamais le secret en clair.",
      copyable: false,
    },
    {
      step: 8,
      field: "Authentification endpoint token",
      value: "client_secret_basic",
      note: "Menu Méthode d'authentification de l'endpoint du token.",
      copyable: true,
    },
    {
      step: 9,
      field: "Périmètres par défaut",
      value: selectedClientScopes,
      note: "Coller dans Périmètres par défaut.",
      copyable: true,
    },
    {
      step: 10,
      field: "Périmètres de base",
      value: selectedClientScopes,
      note: "Coller la même valeur dans Périmètres de base.",
      copyable: true,
    },
    {
      step: 11,
      field: "URL jeton",
      value: CHATGPT_OAUTH_TOKEN_URL,
      note: "Endpoints OAuth > URL jeton.",
      copyable: true,
    },
    {
      step: 12,
      field: "URL d'autorisation",
      value: CHATGPT_OAUTH_AUTHORIZATION_URL,
      note: "Endpoints OAuth > URL d'autorisation. Obligatoire pour ChatGPT.",
      copyable: true,
    },
    {
      step: 13,
      field: "URL d'enregistrement",
      value: "Laisser vide",
      note: "Dynamic Client Registration n'est pas active en v1.",
      copyable: false,
    },
    {
      step: 14,
      field: "Base du serveur d'autorisation",
      value: "Laisser vide",
      note: "Non requis pour le token endpoint TOK Connect v1.",
      copyable: false,
    },
    {
      step: 15,
      field: "Resource",
      value: "Laisser vide",
      note: "TOK Connect ignore le parametre resource en v1.",
      copyable: false,
    },
    {
      step: 16,
      field: "OIDC activé",
      value: "Non",
      note: "Ne pas cocher OIDC activé. Laisser les champs OIDC vides.",
      copyable: false,
    },
  ], [selectedClient, selectedClientPublicId, selectedClientScopes]);

  async function copyChatGptMcpValue(item: ChatGptMcpSetupItem) {
    if (!item.copyable) return;

    try {
      await navigator.clipboard.writeText(item.value);
      setCopiedChatGptField(item.field);
      window.setTimeout(() => setCopiedChatGptField((current) => (current === item.field ? null : current)), 1600);
      toast({ title: "Copié", description: `${item.field} est prêt à coller dans ChatGPT.` });
    } catch (copyError) {
      toast({
        title: "Copie impossible",
        description: copyError instanceof Error ? copyError.message : "Copiez la valeur manuellement.",
        variant: "destructive",
      });
    }
  }

  async function runAdminAction(action: "approve-partner" | "suspend-partner" | "revoke-partner" | "revoke-client") {
    setBusyAction(action);
    setError(null);
    try {
      if (action === "revoke-client") {
        if (!selectedClientUuid) throw new Error("Sélectionnez un client TOK Connect.");
        await callTokConnectAdminAction({ action, client_uuid: selectedClientUuid });
      } else {
        if (!selectedPartnerId) throw new Error("Sélectionnez un partenaire TOK Connect.");
        await callTokConnectAdminAction({ action, partner_id: selectedPartnerId });
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action admin impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runAgentRunAction(action: "approve-agent-run" | "reject-agent-run") {
    setBusyAction(action);
    setError(null);
    try {
      if (!selectedAgentRunId) throw new Error("Sélectionnez un run Autopilot.");
      await callTokConnectAdminAction({ action, agent_run_id: selectedAgentRunId });
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action Autopilot impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runClientPolicyUpdate() {
    setBusyAction("update-client-policy");
    setError(null);
    try {
      if (!selectedClientUuid) throw new Error("Sélectionnez un client TOK Connect.");
      await callTokConnectAdminAction({
        action: "update-client-policy",
        client_uuid: selectedClientUuid,
        allowed_scopes: clientScopesInput,
        token_ttl_seconds: Number(clientTtlSeconds),
        tok_connect_quota_per_minute: Number(clientQuotaPerMinute),
      });
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mise à jour client impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runGrantUpsert() {
    setBusyAction("upsert-restaurant-grant");
    setError(null);
    try {
      if (!grantForm.partner_id || !grantForm.restaurant_id) {
        throw new Error("Partner ID et restaurant ID sont requis.");
      }
      await callTokConnectAdminAction({
        action: "upsert-restaurant-grant",
        partner_id: grantForm.partner_id,
        restaurant_id: grantForm.restaurant_id,
        allowed_scopes: grantForm.allowed_scopes,
        status: grantForm.status,
        allow_mcp: grantForm.allow_mcp,
        max_daily_reservations: Number(grantForm.max_daily_reservations),
        max_party_size: Number(grantForm.max_party_size),
        expires_at: grantForm.expires_at || null,
      });
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mise à jour grant impossible.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">Admin</p>
            <h1 className="mt-2 text-4xl font-black tracking-normal">Supervision TOK Connect</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Approbation partenaires, scopes, quotas, restaurants autorisés, révocations, logs API et livraisons webhook.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            Actualiser
          </Button>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-5">
          {metrics.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-lg border bg-white p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <p className="mt-4 text-3xl font-black">{loading ? "..." : value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Clipboard className="h-6 w-6 text-orange-600" />
                <h2 className="text-xl font-black">Checklist ChatGPT MCP</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Copiez les valeurs dans ChatGPT dans cet ordre. Les lignes marquées "Laisser vide" ne doivent pas être renseignées.
              </p>
              <p className="mt-2 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-900">
                {CHATGPT_INVALID_CLIENT_HELP}
              </p>
            </div>
            <div className="rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
              Client sélectionné: {selectedClientPublicId}
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {chatGptMcpSetupItems.map((item) => (
              <ChatGptMcpSetupRow
                key={`${item.step}-${item.field}`}
                item={item}
                copied={copiedChatGptField === item.field}
                onCopy={() => copyChatGptMcpValue(item)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-black">Actions partenaires</h2>
              <p className="mt-2 text-sm text-slate-600">
                Les actions sensibles passent par tok-connect-portal et sont auditées côté Edge Function.
              </p>
            </div>
            <div className="grid w-full gap-3 xl:max-w-3xl">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold uppercase text-slate-500">
                  Partner ID
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900"
                    value={selectedPartnerId}
                    onChange={(event) => {
                      setSelectedPartnerId(event.target.value);
                      setGrantForm((current) => ({ ...current, partner_id: event.target.value }));
                    }}
                    placeholder="uuid partenaire"
                  />
                </label>
                <label className="text-xs font-bold uppercase text-slate-500">
                  Client UUID
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900"
                    value={selectedClientUuid}
                    onChange={(event) => setSelectedClientUuid(event.target.value)}
                    placeholder="uuid client oauth"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!selectedPartnerId || busyAction === "approve-partner"} onClick={() => runAdminAction("approve-partner")}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approuver
                </Button>
                <Button variant="outline" disabled={!selectedPartnerId || busyAction === "suspend-partner"} onClick={() => runAdminAction("suspend-partner")}>
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Suspendre
                </Button>
                <Button variant="outline" disabled={!selectedPartnerId || busyAction === "revoke-partner"} onClick={() => runAdminAction("revoke-partner")}>
                  <ShieldX className="mr-2 h-4 w-4" />
                  Révoquer partenaire
                </Button>
                <Button variant="outline" disabled={!selectedClientUuid || busyAction === "revoke-client"} onClick={() => runAdminAction("revoke-client")}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Révoquer client
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-black">Politique client OAuth</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="md:col-span-3 text-xs font-bold uppercase text-slate-500">
                Scopes autorises
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" value={clientScopesInput} onChange={(event) => setClientScopesInput(event.target.value)} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                TTL token
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" type="number" min={60} max={3600} value={clientTtlSeconds} onChange={(event) => setClientTtlSeconds(event.target.value)} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Quota/minute
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" type="number" min={1} max={10000} value={clientQuotaPerMinute} onChange={(event) => setClientQuotaPerMinute(event.target.value)} />
              </label>
              <div className="flex items-end">
                <Button variant="outline" disabled={!selectedClientUuid || busyAction === "update-client-policy"} onClick={runClientPolicyUpdate}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Mettre à jour
                </Button>
              </div>
            </div>
          </article>

          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-black">Grant restaurant</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-bold uppercase text-slate-500">
                Partner ID
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" value={grantForm.partner_id} onChange={(event) => setGrantForm((current) => ({ ...current, partner_id: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Restaurant ID
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" value={grantForm.restaurant_id} onChange={(event) => setGrantForm((current) => ({ ...current, restaurant_id: event.target.value }))} />
              </label>
              <label className="md:col-span-2 text-xs font-bold uppercase text-slate-500">
                Scopes
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" value={grantForm.allowed_scopes} onChange={(event) => setGrantForm((current) => ({ ...current, allowed_scopes: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Statut
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" value={grantForm.status} onChange={(event) => setGrantForm((current) => ({ ...current, status: event.target.value as GrantFormState["status"] }))}>
                  <option value="pending">pending</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="revoked">revoked</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Expiration
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" type="datetime-local" value={grantForm.expires_at} onChange={(event) => setGrantForm((current) => ({ ...current, expires_at: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Reservations/jour
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" type="number" min={0} max={500} value={grantForm.max_daily_reservations} onChange={(event) => setGrantForm((current) => ({ ...current, max_daily_reservations: event.target.value }))} />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Couverts max
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900" type="number" min={1} max={50} value={grantForm.max_party_size} onChange={(event) => setGrantForm((current) => ({ ...current, max_party_size: event.target.value }))} />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={grantForm.allow_mcp} onChange={(event) => setGrantForm((current) => ({ ...current, allow_mcp: event.target.checked }))} />
                Autoriser MCP
              </label>
              <div className="flex justify-end">
                <Button variant="outline" disabled={busyAction === "upsert-restaurant-grant"} onClick={runGrantUpsert}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Enregistrer grant
                </Button>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-black">Autopilot contrôlé</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Les runs tok_connect_agent_runs peuvent être approuvés ou rejetés ici. L'approbation ne déclenche pas
                de campagne ou dépense automatiquement.
              </p>
            </div>
            <div className="grid w-full gap-3 xl:max-w-3xl">
              <label className="text-xs font-bold uppercase text-slate-500">
                Agent run ID
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm normal-case text-slate-900"
                  value={selectedAgentRunId}
                  onChange={(event) => setSelectedAgentRunId(event.target.value)}
                  placeholder="uuid tok_connect_agent_runs"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!selectedAgentRunId || busyAction === "approve-agent-run"} onClick={() => runAgentRunAction("approve-agent-run")}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approuver le run
                </Button>
                <Button variant="outline" disabled={!selectedAgentRunId || busyAction === "reject-agent-run"} onClick={() => runAgentRunAction("reject-agent-run")}>
                  <ShieldX className="mr-2 h-4 w-4" />
                  Rejeter le run
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <AdminTokConnectPanel title="tok_connect_partners" rows={state.partners} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_clients" rows={state.clients} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_api_requests" rows={state.requests} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_restaurant_grants" rows={state.grants} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_webhook_deliveries" rows={state.deliveries} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_agent_runs" rows={state.agentRuns} loading={loading} />
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-orange-600" />
            <h2 className="text-xl font-black">Garde-fous v1</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {["Autopilot désactivé", "Secrets uniquement via Edge Functions", "Réservations réelles idempotentes"].map((item) => (
              <div key={item} className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-700">{item}</div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ChatGptMcpSetupRow({
  item,
  copied,
  onCopy,
}: {
  item: ChatGptMcpSetupItem;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[48px_minmax(0,220px)_minmax(0,1fr)_auto] md:items-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-black text-orange-600 shadow-sm">
        {item.step}
      </div>
      <div>
        <p className="text-sm font-black text-slate-900">{item.field}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
      </div>
      <code className="min-w-0 break-all rounded-md bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-900 ring-1 ring-slate-200">
        {item.value}
      </code>
      {item.copyable ? (
        <Button type="button" variant="outline" className="justify-center" onClick={onCopy}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
          {copied ? "Copié" : "Copier"}
        </Button>
      ) : (
        <span className="rounded-md bg-white px-3 py-2 text-center text-xs font-bold uppercase text-slate-500 ring-1 ring-slate-200">
          Info
        </span>
      )}
    </div>
  );
}

function AdminTokConnectPanel({ title, rows, loading }: { title: string; rows: TokConnectRow[]; loading: boolean }) {
  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">{title}</h2>
      {loading ? <p className="mt-4 text-sm text-slate-500">Chargement...</p> : null}
      {!loading && rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aucune donnée accessible.</p> : null}
      <div className="mt-4 max-h-[420px] space-y-2 overflow-auto">
        {rows.slice(0, 12).map((row, index) => (
          <pre key={String(row.id || row.request_id || index)} className="rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            {JSON.stringify(row, null, 2)}
          </pre>
        ))}
      </div>
    </article>
  );
}
