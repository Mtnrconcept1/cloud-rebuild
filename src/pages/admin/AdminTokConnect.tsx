import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, Network, ShieldAlert, ShieldCheck, ShieldX, SlidersHorizontal, Webhook } from "lucide-react";

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
  allowed_scopes: "restaurants:read availability:read reservations:create reservations:cancel",
  status: "pending",
  allow_mcp: false,
  max_daily_reservations: "25",
  max_party_size: "8",
  expires_at: "",
};

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
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedClientUuid, setSelectedClientUuid] = useState("");
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
  }, [selectedClientUuid, selectedPartnerId, state.clients, state.partners]);

  const metrics = useMemo(() => [
    { label: "Partenaires", value: state.partners.length, icon: Network },
    { label: "Requêtes API", value: state.requests.length, icon: Activity },
    { label: "Grants restaurants", value: state.grants.length, icon: KeyRound },
    { label: "Livraisons webhook", value: state.deliveries.length, icon: Webhook },
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
