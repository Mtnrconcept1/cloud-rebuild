import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { buildBackendFunctionUrl } from "@/lib/backendFunctionUrls";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

export const DASHBOARD_TOK_CONNECT_GRANTS_LIMIT = 100;

type GrantRow = {
  id: string;
  partner_id: string;
  restaurant_id: string;
  allowed_scopes: string[];
  status: string;
  allow_mcp: boolean;
  max_daily_reservations: number;
  max_party_size: number;
  expires_at: string | null;
  created_at: string;
};

type QueryResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

type TokConnectQueryBuilder<T> = {
  select: (columns: string) => TokConnectQueryBuilder<T>;
  eq: (column: string, value: string) => TokConnectQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => TokConnectQueryBuilder<T>;
  limit: (count: number) => QueryResult<T>;
};

type TokConnectSupabase = {
  from: <T>(table: string) => TokConnectQueryBuilder<T>;
};

type TokConnectEnvelope<TData> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  request_id: string;
};

async function fetchRestaurantGrants(restaurantId: string) {
  const supabase = getSupabase() as unknown as TokConnectSupabase;
  // RLS: public.auth_owns_restaurant(restaurant_id)
  const { data, error } = await supabase
    .from<GrantRow>("tok_connect_restaurant_grants")
    .select("id, partner_id, restaurant_id, allowed_scopes, status, allow_mcp, max_daily_reservations, max_party_size, expires_at, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_TOK_CONNECT_GRANTS_LIMIT);

  if (error) throw new Error(error.message);
  return data || [];
}

async function updateGrantStatus(grantId: string, status: "active" | "revoked") {
  const response = await fetchWithFreshAccessToken(buildBackendFunctionUrl("tok-connect-portal"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update-grant-status",
      grant_id: grantId,
      status,
    }),
  });
  const payload = await response.json() as TokConnectEnvelope<Record<string, unknown>>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "Mise a jour du consentement impossible.");
  }
}

export default function DashboardTokConnect() {
  const { selectedId, restaurants, loading: restaurantsLoading } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    setLoading(true);
    try {
      setGrants(await fetchRestaurantGrants(selectedId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Chargement des consentements impossible.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => ({
    active: grants.filter((grant) => grant.status === "active").length,
    pending: grants.filter((grant) => grant.status === "pending").length,
    mcp: grants.filter((grant) => grant.allow_mcp).length,
  }), [grants]);

  async function changeStatus(grantId: string, status: "active" | "revoked") {
    setBusyId(grantId);
    setError(null);
    try {
      await updateGrantStatus(grantId, status);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">Partenaires</p>
            <h1 className="mt-2 text-4xl font-black tracking-normal">Consentements TOK Connect</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Autorisez ou révoquez les partenaires approuvés pour ce restaurant, avec scopes et limites de réservation.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading || restaurantsLoading || !selectedId}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
        </header>

        {!selectedRestaurant ? (
          <div className="rounded-lg border bg-white p-5 text-sm text-slate-600">Sélectionnez un restaurant pour gérer ses grants.</div>
        ) : null}

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Grants actifs" value={metrics.active} icon={ShieldCheck} />
          <Metric label="En attente" value={metrics.pending} icon={KeyRound} />
          <Metric label="MCP autorisé" value={metrics.mcp} icon={ShieldCheck} />
        </section>

        <section className="rounded-lg border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-black">tok_connect_restaurant_grants</h2>
            <p className="mt-2 text-sm text-slate-600">
              Les mutations restent protégées par RLS et limitées au restaurant sélectionné.
            </p>
          </div>

          {loading ? <p className="p-5 text-sm text-slate-500">Chargement...</p> : null}
          {!loading && grants.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucun partenaire autorisé pour ce restaurant.</p> : null}

          <div className="divide-y">
            {grants.map((grant) => (
              <article key={grant.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">Partenaire {String(grant.partner_id).slice(0, 8)}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{grant.status}</span>
                    {grant.allow_mcp ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">MCP</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(grant.allowed_scopes || []).map((scope) => (
                      <span key={scope} className="rounded-full border px-3 py-1 text-xs font-semibold text-slate-600">{scope}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Limites: {grant.max_daily_reservations || 0} réservations/jour, {grant.max_party_size || 0} couverts max.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    disabled={busyId === grant.id || grant.status === "active"}
                    onClick={() => changeStatus(grant.id, "active")}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Autoriser
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busyId === grant.id || grant.status === "revoked"}
                    onClick={() => changeStatus(grant.id, "revoked")}
                  >
                    <ShieldX className="mr-2 h-4 w-4" />
                    Révoquer
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <Icon className="h-6 w-6 text-orange-600" />
      <p className="mt-4 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
    </article>
  );
}
