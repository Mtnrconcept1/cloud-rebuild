import { useCallback, useEffect, useState } from "react";
import { Ban, Bot, FileDown, KeyRound, RefreshCw, Send, ShieldCheck, Terminal, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildBackendFunctionUrl } from "@/lib/backendFunctionUrls";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { tokConnectOpenApiDocument } from "@/lib/tokConnectOpenApi";

type TokConnectEnvelope<TData> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  request_id: string;
};

type PortalClient = {
  id: string;
  client_id: string;
  environment: string;
  allowed_scopes: string[];
  status: string;
  created_at?: string;
};

type PortalOverview = {
  clients: PortalClient[];
  api_requests: Array<{ request_id: string; method: string; route: string; status_code: number; created_at: string }>;
  webhook_endpoints: Array<{ id: string; url: string; events: string[]; status: string }>;
  webhook_deliveries: Array<{ id: string; event_type: string; status: string; attempts: number; created_at: string }>;
  agent_runs: Array<{ id: string; mode: string; tool_name: string; status: string; approval_required: boolean; created_at: string }>;
  quotas: Record<string, unknown>;
};

const DEFAULT_WEBHOOK_URL = "https://example.com/tok/webhooks";

async function callTokConnectPortal<TData>(body: Record<string, unknown>) {
  const response = await fetchWithFreshAccessToken(buildBackendFunctionUrl("tok-connect-portal"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TokConnectEnvelope<TData>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "Action TOK Connect impossible.");
  }
  return payload.data as TData;
}

export default function TokConnectDeveloper() {
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);

  const firstClient = overview?.clients?.[0] || null;
  const firstEndpoint = overview?.webhook_endpoints?.[0] || null;

  const loadOverview = useCallback(async () => {
    setError(null);
    const data = await callTokConnectPortal<PortalOverview>({ action: "overview" });
    setOverview(data);
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    loadOverview()
      .catch((nextError) => {
        if (!disposed) setError(nextError instanceof Error ? nextError.message : "Chargement impossible.");
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [loadOverview]);

  async function runAction(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    setOneTimeSecret(null);
    try {
      const result = await callTokConnectPortal<Record<string, unknown>>({ action, ...payload });
      if (typeof result.client_secret === "string") setOneTimeSecret(result.client_secret);
      if (typeof result.signing_secret === "string") setOneTimeSecret(result.signing_secret);
      await loadOverview();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  function downloadOpenApi() {
    const blob = new Blob([tokConnectOpenApiDocument], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tok-connect-openapi.yaml";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">TOK Connect Developer</p>
            <h1 className="mt-3 text-4xl font-black tracking-normal md:text-5xl">Portail développeur</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Créez un client OAuth sandbox, testez les scopes, surveillez les logs, configurez les webhooks et préparez
              une intégration MCP sans mutation production.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Quota sandbox</p>
            <p className="mt-2 text-3xl font-black">240 req/min</p>
            <p className="mt-1 text-sm text-slate-600">Tokens courts, scopes stricts, autopilot désactivé.</p>
          </div>
        </header>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {oneTimeSecret ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-black text-orange-800">Secret affiché une seule fois</p>
            <code className="mt-2 block break-all rounded bg-white p-3 text-xs text-slate-800">{oneTimeSecret}</code>
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <KeyRound className="h-7 w-7 text-orange-600" />
            <h2 className="mt-4 text-xl font-black">Client OAuth sandbox</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Client-credentials scoped, secret hashé côté Edge Function et rotation traçable.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button disabled={busy === "create-sandbox-client"} onClick={() => runAction("create-sandbox-client", {})}>
                <KeyRound className="mr-2 h-4 w-4" />
                Créer sandbox
              </Button>
              <Button
                variant="outline"
                disabled={!firstClient || busy === "rotate-client-secret"}
                onClick={() => firstClient && runAction("rotate-client-secret", { client_uuid: firstClient.id })}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Rotation
              </Button>
              <Button
                variant="outline"
                disabled={!firstClient || busy === "revoke-client"}
                onClick={() => firstClient && runAction("revoke-client", { client_uuid: firstClient.id })}
              >
                <Ban className="mr-2 h-4 w-4" />
                Revoquer
              </Button>
            </div>
          </article>

          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <Webhook className="h-7 w-7 text-orange-600" />
            <h2 className="mt-4 text-xl font-black">Webhooks signés</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              `reservation.created`, `reservation.cancelled`, `webhook.test`, `campaign.previewed`.
            </p>
            <div className="mt-5 flex gap-2">
              <Input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} aria-label="URL webhook" />
              <Button
                variant="outline"
                disabled={busy === "create-webhook-endpoint"}
                onClick={() => runAction("create-webhook-endpoint", { webhook_url: webhookUrl, events: ["webhook.test"] })}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="mt-3"
              variant="outline"
              disabled={!firstEndpoint || busy === "send-webhook-test"}
              onClick={() => firstEndpoint && runAction("send-webhook-test", { endpoint_id: firstEndpoint.id })}
            >
              <Webhook className="mr-2 h-4 w-4" />
              Test webhook
            </Button>
          </article>

          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <ShieldCheck className="h-7 w-7 text-orange-600" />
            <h2 className="mt-4 text-xl font-black">Scopes actifs</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(firstClient?.allowed_scopes || ["restaurants:read", "availability:read"]).map((scope) => (
                <span key={scope} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{scope}</span>
              ))}
            </div>
          </article>

          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <Bot className="h-7 w-7 text-orange-600" />
            <h2 className="mt-4 text-xl font-black">Autopilot avancé</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Les plans Autopilot restent bornés, stockés dans tok_connect_agent_runs et bloqués avant validation humaine.
            </p>
            <p className="mt-4 text-3xl font-black">{overview?.agent_runs?.length || 0}</p>
            <p className="mt-1 text-sm text-slate-600">runs visibles</p>
          </article>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Documentation OpenAPI</h2>
              <Button type="button" variant="outline" onClick={downloadOpenApi}>
                <FileDown className="mr-2 h-4 w-4" />
                Télécharger
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{tokConnectOpenApiDocument}</pre>
          </article>

          <article className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-orange-600" />
              <h2 className="text-xl font-black">Exemple MCP</h2>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{`{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prepare_reservation",
    "arguments": {
      "restaurant_id": "...",
      "date": "2026-06-26",
      "time": "19:30",
      "party_size": 2
    }
  }
}`}</pre>
          </article>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <DataPanel title="Clients" loading={loading} rows={overview?.clients || []} />
          <DataPanel title="Logs API" loading={loading} rows={overview?.api_requests || []} />
          <DataPanel title="Webhooks" loading={loading} rows={overview?.webhook_endpoints || []} />
          <DataPanel title="tok_connect_agent_runs" loading={loading} rows={overview?.agent_runs || []} />
        </section>
      </div>
    </main>
  );
}

function DataPanel({ title, rows, loading }: { title: string; rows: Array<Record<string, unknown>>; loading: boolean }) {
  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">{title}</h2>
      {loading ? <p className="mt-4 text-sm text-slate-500">Chargement...</p> : null}
      {!loading && rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aucune donnée pour le moment.</p> : null}
      <div className="mt-4 space-y-2">
        {rows.slice(0, 5).map((row, index) => (
          <div key={String(row.id || row.request_id || index)} className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
            <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(row, null, 2)}</pre>
          </div>
        ))}
      </div>
    </article>
  );
}
