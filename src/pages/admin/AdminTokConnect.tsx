import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, Network, ShieldAlert, ShieldCheck, ShieldX, Webhook } from "lucide-react";

import { Button } from "@/components/ui/button";
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
};

const emptyState: AdminTokConnectState = {
  partners: [],
  clients: [],
  requests: [],
  deliveries: [],
  grants: [],
};

type TokConnectEnvelope<TData> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  request_id: string;
};

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
  const [partners, clients, requests, deliveries, grants] = await Promise.all([
    supabase.from("tok_connect_partners").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("tok_connect_clients").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("tok_connect_api_requests").select("*").order("created_at", { ascending: false }).limit(ADMIN_TOK_CONNECT_LOG_LIMIT),
    supabase.from("tok_connect_webhook_deliveries").select("*").order("created_at", { ascending: false }).limit(ADMIN_TOK_CONNECT_LOG_LIMIT),
    supabase.from("tok_connect_restaurant_grants").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const firstError = [partners.error, clients.error, requests.error, deliveries.error, grants.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  return {
    partners: partners.data || [],
    clients: clients.data || [],
    requests: requests.data || [],
    deliveries: deliveries.data || [],
    grants: grants.data || [],
  };
}

export default function AdminTokConnect() {
  const [state, setState] = useState<AdminTokConnectState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const metrics = useMemo(() => [
    { label: "Partenaires", value: state.partners.length, icon: Network },
    { label: "Requêtes API", value: state.requests.length, icon: Activity },
    { label: "Grants restaurants", value: state.grants.length, icon: KeyRound },
    { label: "Livraisons webhook", value: state.deliveries.length, icon: Webhook },
  ], [state]);

  const firstPartnerId = typeof state.partners[0]?.id === "string" ? state.partners[0].id as string : null;
  const firstClientId = typeof state.clients[0]?.id === "string" ? state.clients[0].id as string : null;

  async function runAdminAction(action: "approve-partner" | "suspend-partner" | "revoke-partner" | "revoke-client") {
    setBusyAction(action);
    setError(null);
    try {
      if (action === "revoke-client") {
        if (!firstClientId) throw new Error("Aucun client TOK Connect selectionnable.");
        await callTokConnectAdminAction({ action, client_uuid: firstClientId });
      } else {
        if (!firstPartnerId) throw new Error("Aucun partenaire TOK Connect selectionnable.");
        await callTokConnectAdminAction({ action, partner_id: firstPartnerId });
      }
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action admin impossible.");
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

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-lg border bg-white p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <p className="mt-4 text-3xl font-black">{loading ? "..." : value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Actions partenaires</h2>
              <p className="mt-2 text-sm text-slate-600">
                Les actions sensibles passent par tok-connect-portal et sont auditees cote Edge Function.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!firstPartnerId || busyAction === "approve-partner"} onClick={() => runAdminAction("approve-partner")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Approuver
              </Button>
              <Button variant="outline" disabled={!firstPartnerId || busyAction === "suspend-partner"} onClick={() => runAdminAction("suspend-partner")}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                Suspendre
              </Button>
              <Button variant="outline" disabled={!firstPartnerId || busyAction === "revoke-partner"} onClick={() => runAdminAction("revoke-partner")}>
                <ShieldX className="mr-2 h-4 w-4" />
                Revoquer partenaire
              </Button>
              <Button variant="outline" disabled={!firstClientId || busyAction === "revoke-client"} onClick={() => runAdminAction("revoke-client")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Revoquer client
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <AdminTokConnectPanel title="tok_connect_partners" rows={state.partners} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_clients" rows={state.clients} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_api_requests" rows={state.requests} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_restaurant_grants" rows={state.grants} loading={loading} />
          <AdminTokConnectPanel title="tok_connect_webhook_deliveries" rows={state.deliveries} loading={loading} />
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
