import { useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ServerCog,
  Shield,
  TerminalSquare,
  TimerReset,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type HealthStatus = "ok" | "watch" | "critical";

type AuditEntry = {
  id: string;
  source: "edge" | "data";
  createdAt: string;
  action: string;
  status: "success" | "failure" | "info";
  actorLabel: string;
  targetType: string;
  targetId: string;
  summary: string;
};

type PaymentAnomaly = {
  kind: string;
  severity: "critical" | "high" | "medium" | "low";
  created_at?: string;
  updated_at?: string;
  order_id?: string;
  order_number?: string;
  campaign_id?: string;
  payment_transaction_id?: string;
  reservation_id?: string;
  restaurant_id?: string;
  user_id?: string;
  status?: string;
  payment_status?: string;
  stripe_session_id?: string;
  stripe_payment_intent_id?: string;
  stripe_payment_intent?: string;
  checkout_id?: string;
  checkout_kind?: string;
  amount?: number;
  currency?: string;
  title?: string;
};

type PaymentIntegrityReport = {
  checkedAt: string;
  windowHours: number;
  total: number;
  critical: number;
  high: number;
  status?: HealthStatus;
  message?: string;
  items: PaymentAnomaly[];
};

type ProductionHealthAlert = {
  source: string;
  label: string;
  status: HealthStatus;
  priority?: "P0" | "P1" | "P2";
  message?: string;
  actionUrl?: string;
};

type CronHealthJob = {
  jobName: string;
  label: string;
  priority?: "P0" | "P1" | "P2";
  status: HealthStatus;
  schedule?: string;
  expectedSchedule?: string;
  active?: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  lastDurationMs?: number | null;
  nextRunAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  message?: string;
  actionUrl?: string;
  remediation?: string;
};

type EdgeFunctionHealth = {
  functionName: string;
  label: string;
  priority?: "P0" | "P1" | "P2";
  status: HealthStatus;
  total24h?: number;
  success24h?: number;
  failures24h?: number;
  failureRate?: number | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  message?: string;
  actionUrl?: string;
  remediation?: string;
};

type StripeHealth = {
  status: HealthStatus;
  total24h?: number;
  success24h?: number;
  failures24h?: number;
  ignored24h?: number;
  failureRate?: number | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  message?: string;
  actionUrl?: string;
};

type ConfigurationCheck = {
  key: string;
  label: string;
  status: HealthStatus;
  message?: string;
  actionUrl?: string;
  source?: string;
};

type AdvisorItem = {
  name?: string;
  title?: string;
  level?: string;
  categories?: string[];
  detail?: string;
  remediation?: string;
};

type AdvisorHealth = {
  status: HealthStatus;
  capturedAt?: string | null;
  source?: string | null;
  total?: number;
  critical?: number;
  warning?: number;
  security?: number;
  performance?: number;
  items?: AdvisorItem[];
  message?: string;
  actionUrl?: string;
};

type ProductionHealthReport = {
  checkedAt: string;
  status: HealthStatus;
  score?: number;
  counts?: {
    critical?: number;
    watch?: number;
    ok?: number;
    cronJobs?: number;
    edgeFunctions?: number;
    paymentAnomalies?: number;
    advisorWarnings?: number;
  };
  alerts?: ProductionHealthAlert[];
  cron?: {
    status: HealthStatus;
    jobs: CronHealthJob[];
  };
  edgeFunctions?: {
    status: HealthStatus;
    functions: EdgeFunctionHealth[];
  };
  stripe?: StripeHealth;
  paymentIntegrity?: PaymentIntegrityReport;
  configuration?: {
    status: HealthStatus;
    checks: ConfigurationCheck[];
  };
  advisors?: AdvisorHealth;
};

const HEALTH_LABELS: Record<HealthStatus, string> = {
  ok: "OK",
  watch: "À surveiller",
  critical: "Critique",
};

const HEALTH_BADGE_CLASSES: Record<HealthStatus, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  watch: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
};

function normalizeHealthStatus(value?: string | null): HealthStatus {
  if (value === "ok" || value === "watch" || value === "critical") {
    return value;
  }
  return "watch";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeOrDash(value?: string | null) {
  return value ? formatDateTime(value) : "-";
}

function formatNumber(value?: number | null) {
  return Number(value ?? 0).toLocaleString("fr-CH");
}

function formatDuration(value?: number | null) {
  if (value == null) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

function formatPercent(value?: number | null) {
  if (value == null) return "-";
  return `${Number(value).toFixed(value >= 10 ? 0 : 1)}%`;
}

function HealthBadge({ status }: { status?: string | null }) {
  const normalized = normalizeHealthStatus(status);
  return (
    <Badge variant="outline" className={HEALTH_BADGE_CLASSES[normalized]}>
      {HEALTH_LABELS[normalized]}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <Badge variant={priority === "P0" ? "destructive" : "outline"} className="text-[10px]">
      {priority}
    </Badge>
  );
}

function ActionLink({ to, label = "Ouvrir" }: { to?: string | null; label?: string }) {
  if (!to) return null;
  return (
    <Button asChild variant="outline" size="sm" className="h-8 gap-2">
      <Link to={to}>
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

function HealthMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function formatAnomalyKind(kind: string) {
  const labels: Record<string, string> = {
    stale_pending_order: "Commande paiement en attente",
    captured_order_without_charge: "Commande capturée sans transaction",
    succeeded_order_charge_without_order: "Paiement réussi sans commande",
    paid_campaign_not_active: "Campagne payée non active",
    paid_campaign_without_transaction: "Campagne payée sans transaction",
    zero_attente_transaction_without_reservation: "Zéro Attente sans réservation",
  };

  return labels[kind] || kind.replace(/_/g, " ");
}

function getAnomalyTarget(anomaly: PaymentAnomaly) {
  return (
    anomaly.order_number ||
    anomaly.order_id ||
    anomaly.campaign_id ||
    anomaly.payment_transaction_id ||
    anomaly.reservation_id ||
    anomaly.stripe_session_id ||
    "-"
  );
}

function getAnomalySummary(anomaly: PaymentAnomaly) {
  const parts = [
    anomaly.title,
    anomaly.status ? `statut ${anomaly.status}` : null,
    anomaly.payment_status ? `paiement ${anomaly.payment_status}` : null,
    anomaly.amount != null ? `${Number(anomaly.amount).toFixed(2)} ${String(anomaly.currency || "CHF").toUpperCase()}` : null,
    anomaly.stripe_session_id ? `session ${anomaly.stripe_session_id}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Anomalie à vérifier";
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "edge" | "data">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failure" | "info">("all");

  const {
    data: productionHealth,
    isLoading: productionHealthLoading,
    error: productionHealthError,
    refetch: refetchProductionHealth,
  } = useQuery({
    queryKey: ["admin-production-health"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_production_health");
      if (error) throw error;
      return data as ProductionHealthReport;
    },
    refetchInterval: 60_000,
  });

  const { data: paymentIntegrity, isLoading: paymentIntegrityLoading, error: paymentIntegrityError, refetch: refetchPaymentIntegrity } = useQuery({
    queryKey: ["payment-integrity-anomalies", 48],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_payment_integrity_anomalies", {
        p_hours: 48,
      });
      if (error) throw error;
      return data as PaymentIntegrityReport;
    },
  });

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["admin-audit-logs-full"],
    queryFn: async () => {
      const [edgeResponse, dataResponse] = await Promise.all([
        (supabase.from("edge_function_audit_logs" as any))
          .select("id, function_name, action, actor_user_id, actor_roles, is_service_role, status, target_entity_type, target_entity_id, error_message, request_metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        (supabase.from("audit_log" as any))
          .select("id, user_id, action, entity_type, entity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (edgeResponse.error) throw edgeResponse.error;
      if (dataResponse.error) throw dataResponse.error;

      const normalizedEdgeLogs: AuditEntry[] = ((edgeResponse.data || []) as any[]).map((row) => ({
        id: String(row.id),
        source: "edge",
        createdAt: String(row.created_at),
        action: `${row.function_name}:${row.action || "invoke"}`,
        status: row.status === "failure" ? "failure" : "success",
        actorLabel: row.is_service_role
          ? (Array.isArray(row.actor_roles) && row.actor_roles.includes("scheduler") ? "scheduler" : "service_role")
          : (row.actor_user_id || "utilisateur"),
        targetType: String(row.target_entity_type || "edge"),
        targetId: String(row.target_entity_id || ""),
        summary: row.error_message
          ? String(row.error_message)
          : String((row.request_metadata as Record<string, unknown> | null)?.path || row.function_name || "Exécution Edge"),
      }));

      const normalizedDataLogs: AuditEntry[] = ((dataResponse.data || []) as any[]).map((row) => ({
        id: String(row.id),
        source: "data",
        createdAt: String(row.created_at),
        action: String(row.action || "mutation"),
        status: "info",
        actorLabel: String(row.user_id || "utilisateur"),
        targetType: String(row.entity_type || "entity"),
        targetId: String(row.entity_id || ""),
        summary: `${String(row.entity_type || "entity")} ${String(row.entity_id || "")}`.trim(),
      }));

      return [...normalizedEdgeLogs, ...normalizedDataLogs]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    },
  });

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSource = sourceFilter === "all" || log.source === sourceFilter;
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;
      const haystack = [
        log.action,
        log.actorLabel,
        log.targetType,
        log.targetId,
        log.summary,
      ].join(" ").toLowerCase();

      return matchesSource && matchesStatus && (!term || haystack.includes(term));
    });
  }, [logs, search, sourceFilter, statusFilter]);

  const paymentAnomalies = paymentIntegrity?.items || [];
  const healthStatus = normalizeHealthStatus(productionHealth?.status);
  const cronJobs = productionHealth?.cron?.jobs || [];
  const edgeFunctions = productionHealth?.edgeFunctions?.functions || [];
  const configurationChecks = productionHealth?.configuration?.checks || [];
  const advisors = productionHealth?.advisors;
  const healthAlerts = productionHealth?.alerts || [];
  const stripe = productionHealth?.stripe;

  const stats = useMemo(() => {
    const last24hThreshold = Date.now() - (24 * 60 * 60 * 1000);
    return {
      total: logs.length,
      edge: logs.filter((log) => log.source === "edge").length,
      failures24h: logs.filter((log) => log.status === "failure" && Date.parse(log.createdAt) >= last24hThreshold).length,
      schedulers24h: logs.filter((log) => log.actorLabel === "scheduler" && Date.parse(log.createdAt) >= last24hThreshold).length,
      paymentAnomalies: paymentIntegrity?.total || 0,
      paymentCritical: paymentIntegrity?.critical || 0,
    };
  }, [logs, paymentIntegrity]);

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Sécurité admin"
        title="Audit et santé production"
        description="Historique des exécutions Edge sensibles, mutations historisées, anomalies de paiement et signaux de supervision production."
        icon={Shield}
        tone="rose"
        visualLabel="Audit"
        stats={[
          { label: "Santé", value: HEALTH_LABELS[healthStatus], icon: Activity },
          { label: "Erreurs 24h", value: stats.failures24h, icon: AlertTriangle },
          { label: "Anomalies paiement", value: stats.paymentAnomalies, icon: CreditCard },
        ]}
      />

      <Card className={healthStatus === "critical" ? "border-destructive/40" : healthStatus === "watch" ? "border-amber-500/35" : undefined}>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ServerCog className="h-4 w-4" />
                Santé production
              </CardTitle>
              <HealthBadge status={productionHealth?.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Synthèse admin des crons, Edge Functions critiques, webhooks Stripe, variables de production et advisors Supabase.
            </p>
            {productionHealth?.checkedAt ? (
              <p className="text-xs text-muted-foreground">Dernière vérification : {formatDateTime(productionHealth.checkedAt)}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void refetchProductionHealth()}
            disabled={productionHealthLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Vérifier
          </Button>
        </CardHeader>
        <CardContent>
          {productionHealthError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger la santé production. Vérifiez que la migration Supabase est déployée.
            </div>
          ) : productionHealthLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((value) => <div key={value} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <HealthMetric label="Score" value={`${productionHealth?.score ?? 0}/100`} icon={Activity} />
                <HealthMetric label="Critiques" value={formatNumber(productionHealth?.counts?.critical)} icon={AlertTriangle} />
                <HealthMetric label="À surveiller" value={formatNumber(productionHealth?.counts?.watch)} icon={Clock3} />
                <HealthMetric label="Crons suivis" value={formatNumber(productionHealth?.counts?.cronJobs)} icon={TimerReset} />
                <HealthMetric label="Edge suivies" value={formatNumber(productionHealth?.counts?.edgeFunctions)} icon={TerminalSquare} />
              </div>

              {healthAlerts.length > 0 ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Alertes prioritaires
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {healthAlerts.map((alert) => (
                      <div key={`${alert.source}-${alert.label}`} className="rounded-md border bg-background/80 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <HealthBadge status={alert.status} />
                          <PriorityBadge priority={alert.priority} />
                          <p className="font-medium">{alert.label}</p>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{alert.message || "Action requise."}</p>
                        <div className="mt-3">
                          <ActionLink to={alert.actionUrl} label="Remédier" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Aucun signal production prioritaire.
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                      <h3 className="font-semibold">Cron jobs</h3>
                      <p className="text-xs text-muted-foreground">État, dernier run, prochain run estimé et erreur récente.</p>
                    </div>
                    <HealthBadge status={productionHealth?.cron?.status} />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Dernier run</TableHead>
                          <TableHead>Prochain</TableHead>
                          <TableHead>Durée</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cronJobs.map((job) => (
                          <TableRow key={job.jobName}>
                            <TableCell className="min-w-52">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{job.label}</span>
                                <PriorityBadge priority={job.priority} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{job.jobName} · {job.schedule || "-"}</p>
                              {job.message ? <p className="mt-1 text-xs text-muted-foreground">{job.message}</p> : null}
                            </TableCell>
                            <TableCell><HealthBadge status={job.status} /></TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDateTimeOrDash(job.lastRunAt)}
                              {job.lastRunStatus ? <div>{job.lastRunStatus}</div> : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTimeOrDash(job.nextRunAt)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDuration(job.lastDurationMs)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                      <h3 className="font-semibold">Edge Functions critiques</h3>
                      <p className="text-xs text-muted-foreground">Taux d’erreur et dernier échec sur 24 heures.</p>
                    </div>
                    <HealthBadge status={productionHealth?.edgeFunctions?.status} />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fonction</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>24h</TableHead>
                          <TableHead>Échec</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {edgeFunctions.map((fn) => (
                          <TableRow key={fn.functionName}>
                            <TableCell className="min-w-52">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{fn.label}</span>
                                <PriorityBadge priority={fn.priority} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{fn.functionName}</p>
                              {fn.lastError ? <p className="mt-1 max-w-md text-xs text-destructive">{fn.lastError}</p> : null}
                            </TableCell>
                            <TableCell><HealthBadge status={fn.status} /></TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatNumber(fn.success24h)} succès
                              <div>{formatNumber(fn.failures24h)} échecs</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatPercent(fn.failureRate)}
                              <div>{formatDateTimeOrDash(fn.lastFailureAt)}</div>
                            </TableCell>
                            <TableCell><ActionLink to={fn.actionUrl} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Stripe webhook</h3>
                    <HealthBadge status={stripe?.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{stripe?.message || "Aucun signal Stripe disponible."}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(stripe?.success24h)}</p>
                      <p className="text-muted-foreground">succès</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(stripe?.failures24h)}</p>
                      <p className="text-muted-foreground">échecs</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(stripe?.ignored24h)}</p>
                      <p className="text-muted-foreground">ignorés</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Dernier succès : {formatDateTimeOrDash(stripe?.lastSuccessAt)}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Supabase advisors</h3>
                    <HealthBadge status={advisors?.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{advisors?.message || "Aucun snapshot synchronisé."}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(advisors?.critical)}</p>
                      <p className="text-muted-foreground">critiques</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(advisors?.warning)}</p>
                      <p className="text-muted-foreground">warnings</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="font-bold">{formatNumber(advisors?.security)}</p>
                      <p className="text-muted-foreground">sécurité</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Snapshot : {formatDateTimeOrDash(advisors?.capturedAt)}
                  </p>
                  {(advisors?.items || []).slice(0, 3).map((item) => (
                    <div key={`${item.name}-${item.title}`} className="mt-3 rounded-md border bg-muted/20 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{item.level || "WARN"}</Badge>
                        <p className="text-xs font-medium">{item.title || item.name}</p>
                      </div>
                      {item.detail ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p> : null}
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <KeyRound className="h-4 w-4" />
                      Variables critiques
                    </h3>
                    <HealthBadge status={productionHealth?.configuration?.status} />
                  </div>
                  <div className="mt-4 space-y-3">
                    {configurationChecks.map((check) => (
                      <div key={check.key} className="rounded-md border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{check.label}</p>
                          <HealthBadge status={check.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{check.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Logs Edge</CardTitle>
            <TerminalSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.edge}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Erreurs 24h</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.failures24h}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Anomalies paiement</CardTitle>
            <CreditCard className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.paymentAnomalies}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Jobs planifiés 24h</CardTitle>
            <Badge variant="outline" className="text-[10px]">Cron</Badge>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.schedulers24h}</p></CardContent>
        </Card>
      </div>

      <Card className={stats.paymentCritical > 0 ? "border-destructive/40" : undefined}>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Intégrité paiements
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Détection automatique des paiements orphelins, commandes en attente, campagnes payées non actives et réservations introuvables.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchPaymentIntegrity()} disabled={paymentIntegrityLoading}>
            <RefreshCw className="h-4 w-4" />
            Vérifier
          </Button>
        </CardHeader>
        <CardContent>
          {paymentIntegrityError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger les anomalies de paiement.
            </div>
          ) : paymentIntegrityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((value) => <div key={value} className="h-12 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : paymentAnomalies.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Aucune anomalie critique détectée sur les {paymentIntegrity?.windowHours || 48} dernières heures.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sévérité</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Résumé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentAnomalies.map((anomaly, index) => (
                  <TableRow key={`${anomaly.kind}-${getAnomalyTarget(anomaly)}-${index}`}>
                    <TableCell>
                      <Badge variant={anomaly.severity === "critical" ? "destructive" : "secondary"}>
                        {anomaly.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatAnomalyKind(anomaly.kind)}</TableCell>
                    <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground">{getAnomalyTarget(anomaly)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">{anomaly.restaurant_id || "-"}</TableCell>
                    <TableCell className="max-w-[30rem] text-xs text-muted-foreground">{getAnomalySummary(anomaly)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 md:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une action, une fonction, un acteur ou une cible"
            className="md:flex-1"
          />
          <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as "all" | "edge" | "data")}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              <SelectItem value="edge">Exécutions Edge</SelectItem>
              <SelectItem value="data">Historique data</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "success" | "failure" | "info")}>
            <SelectTrigger className="md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="success">Succès</SelectItem>
              <SelectItem value="failure">Échec</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Impossible de charger les logs d’audit.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((value) => <div key={value} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quand</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>Résumé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={`${log.source}-${log.id}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={log.source === "edge" ? "default" : "outline"}>
                        {log.source === "edge" ? "Edge" : "Data"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.actorLabel}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status === "failure"
                            ? "destructive"
                            : log.status === "success"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{log.targetType}</div>
                      {log.targetId ? <div className="text-muted-foreground">{log.targetId}</div> : null}
                    </TableCell>
                    <TableCell className="max-w-[28rem] text-xs text-muted-foreground">{log.summary}</TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Aucun log ne correspond au filtre courant.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
