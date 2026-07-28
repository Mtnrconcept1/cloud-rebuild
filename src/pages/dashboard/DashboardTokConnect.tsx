import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Plug, RefreshCw, ShieldCheck, ShieldX, Sparkles } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

export const DASHBOARD_TOK_CONNECT_GRANTS_LIMIT = 100;

// Canonical ChatGPT endpoint. The public origin proxies /mcp to the
// tok-connect-mcp Edge Function, so restaurateurs always copy the stable
// product URL rather than the Supabase function URL.
export const TOK_CONNECT_MCP_ENDPOINT = "https://www.thetok.ch/mcp";

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

function buildDemoGrants(restaurantId: string): GrantRow[] {
  return [
    {
      id: "demo-grant-reservations",
      partner_id: "demo-partner-reservations",
      restaurant_id: restaurantId,
      allowed_scopes: ["reservations:read", "availability:read"],
      status: "active",
      allow_mcp: true,
      max_daily_reservations: 40,
      max_party_size: 12,
      expires_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: "demo-grant-delivery",
      partner_id: "demo-partner-delivery",
      restaurant_id: restaurantId,
      allowed_scopes: ["orders:read"],
      status: "pending",
      allow_mcp: false,
      max_daily_reservations: 0,
      max_party_size: 0,
      expires_at: null,
      created_at: new Date().toISOString(),
    },
  ];
}

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
  const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/tok-connect-portal`, {
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
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { selectedId, restaurants, loading: restaurantsLoading } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    setLoading(true);
    try {
      setGrants(isCommercialDemo ? buildDemoGrants(selectedId) : await fetchRestaurantGrants(selectedId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Chargement des consentements impossible.");
    } finally {
      setLoading(false);
    }
  }, [isCommercialDemo, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => ({
    active: grants.filter((grant) => grant.status === "active").length,
    pending: grants.filter((grant) => grant.status === "pending").length,
    mcp: grants.filter((grant) => grant.allow_mcp && grant.status === "active").length,
  }), [grants]);

  async function changeStatus(grantId: string, status: "active" | "revoked") {
    setBusyId(grantId);
    setError(null);
    if (isCommercialDemo) {
      setGrants((current) => current.map((grant) => (grant.id === grantId ? { ...grant, status } : grant)));
      setBusyId(null);
      return;
    }
    try {
      await updateGrantStatus(grantId, status);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(TOK_CONNECT_MCP_ENDPOINT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible. Sélectionnez l'adresse manuellement.");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Partenaires & IA"
          title="TOK Connect"
          description="Connectez ChatGPT et vos partenaires approuvés à ce restaurant : point d'accès MCP, scopes autorisés et limites de réservation restent sous votre contrôle."
          icon={Plug}
          tone="violet"
          visualLabel="Connecteurs"
          illustration={DASHBOARD_ILLUSTRATIONS.restaurantTokConnect}
          stats={[
            { label: "Grants actifs", value: metrics.active, icon: ShieldCheck },
            { label: "En attente", value: metrics.pending, icon: KeyRound },
            { label: "MCP autorisé", value: metrics.mcp, icon: Sparkles },
          ]}
          actions={(
            <Button variant="outline" onClick={load} disabled={loading || restaurantsLoading || !selectedId}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
          )}
        />

        {!selectedRestaurant ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Sélectionnez un restaurant pour gérer ses connecteurs.
          </p>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl font-bold">Connecter ChatGPT</h2>
            <p className="text-sm text-muted-foreground">
              TOK expose un serveur MCP officiel. Ajoutez-le comme connecteur dans ChatGPT pour consulter vos
              disponibilités et préparer des parcours : aucune réservation, aucun paiement et aucune génération IA
              payante ne peut être déclenché sans validation humaine dans TOK.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="min-w-0 break-all font-mono text-sm font-semibold">{TOK_CONNECT_MCP_ENDPOINT}</code>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={copyEndpoint}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié" : "Copier l'adresse"}
            </Button>
          </div>

          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { step: 1, title: "Ouvrir les connecteurs", detail: "Dans ChatGPT, Paramètres puis Connecteurs, choisissez « Ajouter un connecteur »." },
              { step: 2, title: "Coller l'adresse TOK", detail: "Utilisez l'adresse ci-dessus. L'authentification TOK Connect s'ouvre automatiquement." },
              { step: 3, title: "Autoriser le partenaire", detail: "Le consentement apparaît ci-dessous : activez-le pour ouvrir l'accès MCP à ce restaurant." },
            ].map((item) => (
              <li key={item.step} className="rounded-xl border bg-background p-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                  {item.step}
                </span>
                <p className="mt-2 text-sm font-bold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ol>

          <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Tant qu'aucun consentement n'est actif avec l'option MCP, ChatGPT ne reçoit que des données de
            démonstration : votre carte, vos réservations et vos statistiques restent privées.
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-display text-xl font-bold">Consentements partenaires</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Les mutations restent protégées par RLS et limitées au restaurant sélectionné.
            </p>
          </div>

          {loading ? <p className="p-5 text-sm text-muted-foreground">Chargement…</p> : null}
          {!loading && grants.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Aucun partenaire autorisé pour ce restaurant.</p>
          ) : null}

          <div className="divide-y">
            {grants.map((grant) => (
              <article key={grant.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">Partenaire {String(grant.partner_id).slice(0, 8)}</p>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{grant.status}</span>
                    {grant.allow_mcp ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                        <Sparkles className="h-3 w-3" /> MCP ChatGPT
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(grant.allowed_scopes || []).map((scope) => (
                      <span key={scope} className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">{scope}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Limites : {grant.max_daily_reservations || 0} réservations/jour, {grant.max_party_size || 0} couverts max.
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
    </DashboardLayout>
  );
}

