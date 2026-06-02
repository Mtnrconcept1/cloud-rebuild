import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  KeyRound,
  RefreshCw,
  Search,
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
import { Label } from "@/components/ui/label";
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
type AuditSource = "all" | "edge" | "data";
type AuditStatus = "all" | "success" | "failure" | "info";
type AuditTimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "custom" | "all";
type AuditActorFilter = "all" | "scheduler" | "service_role" | "user";
type AuditSort = "newest" | "oldest";
type AuditCategory = "all" | "payment" | "order" | "ai" | "admin" | "security" | "restaurant" | "system" | "other";

type AuditEntry = {
  id: string;
  source: "edge" | "data";
  createdAt: string;
  action: string;
  functionName: string;
  category: Exclude<AuditCategory, "all">;
  status: Exclude<AuditStatus, "all">;
  actorLabel: string;
  actorType: Exclude<AuditActorFilter, "all">;
  targetType: string;
  targetId: string;
  summary: string;
};

type ProductionHealthReport = {
  checkedAt?: string;
  status?: HealthStatus;
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
  cron?: { status?: HealthStatus; jobs?: Array<{ jobName?: string; label?: string; status?: HealthStatus }> };
  edgeFunctions?: { status?: HealthStatus; functions?: Array<{ functionName?: string; label?: string; status?: HealthStatus; failures24h?: number }> };
  stripe?: { status?: HealthStatus; success24h?: number; failures24h?: number; ignored24h?: number; message?: string };
  configuration?: { status?: HealthStatus; checks?: Array<{ key?: string; label?: string; status?: HealthStatus; message?: string }> };
  advisors?: { status?: HealthStatus; total?: number; critical?: number; warning?: number; security?: number; performance?: number; message?: string };
  alerts?: Array<{ label?: string; status?: HealthStatus; priority?: string; message?: string }>;
};

type PaymentIntegrityReport = {
  checkedAt?: string;
  windowHours?: number;
  total?: number;
  critical?: number;
  high?: number;
  status?: HealthStatus;
  message?: string;
  items?: Array<{
    kind?: string;
    severity?: "critical" | "high" | "medium" | "low";
    order_id?: string;
    order_number?: string;
    payment_transaction_id?: string;
    reservation_id?: string;
    restaurant_id?: string;
    status?: string;
    payment_status?: string;
    title?: string;
  }>;
};

type SecurityAbuseSection = {
  status?: HealthStatus;
  message?: string;
  newAccounts?: number;
  totalFailures?: number;
  failedPaymentTransactions?: number;
  totalUploads?: number;
  auditedActions?: number;
  failedActions?: number;
};

type SecurityAbuseReport = {
  checkedAt?: string;
  windowHours?: number;
  status?: HealthStatus;
  counts?: {
    critical?: number;
    watch?: number;
  };
  massAccountCreation?: SecurityAbuseSection;
  sensitiveEndpointFailures?: SecurityAbuseSection;
  cardTesting?: SecurityAbuseSection;
  massUploads?: SecurityAbuseSection;
  sensitiveActions?: SecurityAbuseSection;
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

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  all: "Tous les types",
  payment: "Paiements / Stripe",
  order: "Commandes / réservations",
  ai: "IA / génération",
  admin: "Admin / gouvernance",
  security: "Sécurité / auth",
  restaurant: "Restaurant / contenus",
  system: "Système / crons",
  other: "Autres",
};

const TIME_RANGE_LABELS: Record<AuditTimeRange, string> = {
  "1h": "Dernière heure",
  "6h": "6 dernières heures",
  "24h": "24 dernières heures",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  custom: "Plage personnalisée",
  all: "Tout l’historique chargé",
};

const AUDIT_LOG_FETCH_LIMIT = 500;

function normalizeHealthStatus(value?: string | null): HealthStatus {
  if (value === "ok" || value === "watch" || value === "critical") return value;
  return "watch";
}

function normalizeAuditStatus(value?: string | null): AuditEntry["status"] {
  const normalized = String(value || "").toLowerCase();
  if (["failure", "failed", "error", "critical"].includes(normalized)) return "failure";
  if (["success", "succeeded", "ok", "completed"].includes(normalized)) return "success";
  return "info";
}

function inferActorType(actorLabel: string): AuditEntry["actorType"] {
  if (actorLabel === "scheduler") return "scheduler";
  if (actorLabel === "service_role") return "service_role";
  return "user";
}

function inferLogCategory(input: string): AuditEntry["category"] {
  const value = input.toLowerCase();
  if (/stripe|payment|checkout|charge|refund|capture|card/.test(value)) return "payment";
  if (/order|commande|reservation|booking|delivery|dispatch|match/.test(value)) return "order";
  if (/ai|openai|image|prompt|generation|enhance|photo|model/.test(value)) return "ai";
  if (/admin|audit|feature|role|governance|moderation|flag/.test(value)) return "admin";
  if (/auth|security|abuse|rls|secret|cors|login|signup|token|unauthorized/.test(value)) return "security";
  if (/restaurant|menu|dish|media|gallery|floorplan|table/.test(value)) return "restaurant";
  if (/cron|scheduler|worker|notification|email|edge|webhook|sync|reconcile/.test(value)) return "system";
  return "other";
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-CH", {
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

function getTimeRangeStart(range: AuditTimeRange) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  if (range === "1h") return new Date(now - hour).toISOString();
  if (range === "6h") return new Date(now - 6 * hour).toISOString();
  if (range === "24h") return new Date(now - 24 * hour).toISOString();
  if (range === "7d") return new Date(now - 7 * 24 * hour).toISOString();
  if (range === "30d") return new Date(now - 30 * 24 * hour).toISOString();
  return null;
}

function toIsoFromLocalDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function HealthBadge({ status }: { status?: string | null }) {
  const normalized = normalizeHealthStatus(status);
  return (
    <Badge variant="outline" className={HEALTH_BADGE_CLASSES[normalized]}>
      {HEALTH_LABELS[normalized]}
    </Badge>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Shield }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function getPaymentTarget(item: NonNullable<PaymentIntegrityReport["items"]>[number]) {
  return item.order_number || item.order_id || item.payment_transaction_id || item.reservation_id || "-";
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<AuditSource>("all");
  const [statusFilter, setStatusFilter] = useState<AuditStatus>("all");
  const [timeRange, setTimeRange] = useState<AuditTimeRange>("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory>("all");
  const [actorFilter, setActorFilter] = useState<AuditActorFilter>("all");
  const [functionFilter, setFunctionFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<AuditSort>("newest");

  const startIso = timeRange === "custom" ? toIsoFromLocalDateTime(customStart) : getTimeRangeStart(timeRange);
  const endIso = timeRange === "custom" ? toIsoFromLocalDateTime(customEnd) : null;

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
  });

  const { data: paymentIntegrity, isLoading: paymentIntegrityLoading, error: paymentIntegrityError, refetch: refetchPaymentIntegrity } = useQuery({
    queryKey: ["payment-integrity-anomalies", 48],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_payment_integrity_anomalies", { p_hours: 48 });
      if (error) throw error;
      return data as PaymentIntegrityReport;
    },
  });

  const { data: securityAbuse, isLoading: securityAbuseLoading, error: securityAbuseError, refetch: refetchSecurityAbuse } = useQuery({
    queryKey: ["admin-security-abuse-summary", 24],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_security_abuse_summary", { p_hours: 24 });
      if (error) throw error;
      return data as SecurityAbuseReport;
    },
  });

  const { data: logs = [], isLoading, error, refetch: refetchLogs } = useQuery({
    queryKey: ["admin-audit-logs-full", startIso, endIso],
    queryFn: async () => {
      let edgeQuery = (supabase.from("edge_function_audit_logs" as any))
        .select("id, function_name, action, actor_user_id, actor_roles, is_service_role, status, target_entity_type, target_entity_id, error_message, request_metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LOG_FETCH_LIMIT);

      let dataQuery = (supabase.from("audit_log" as any))
        .select("id, user_id, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LOG_FETCH_LIMIT);

      if (startIso) {
        edgeQuery = edgeQuery.gte("created_at", startIso);
        dataQuery = dataQuery.gte("created_at", startIso);
      }

      if (endIso) {
        edgeQuery = edgeQuery.lte("created_at", endIso);
        dataQuery = dataQuery.lte("created_at", endIso);
      }

      const [edgeResponse, dataResponse] = await Promise.all([edgeQuery, dataQuery]);
      if (edgeResponse.error) throw edgeResponse.error;
      if (dataResponse.error) throw dataResponse.error;

      const normalizedEdgeLogs: AuditEntry[] = ((edgeResponse.data || []) as any[]).map((row) => {
        const functionName = String(row.function_name || "edge");
        const action = `${functionName}:${row.action || "invoke"}`;
        const actorLabel = row.is_service_role
          ? (Array.isArray(row.actor_roles) && row.actor_roles.includes("scheduler") ? "scheduler" : "service_role")
          : String(row.actor_user_id || "utilisateur");
        const targetType = String(row.target_entity_type || "edge");
        const targetId = String(row.target_entity_id || "");
        const summary = row.error_message
          ? String(row.error_message)
          : String((row.request_metadata as Record<string, unknown> | null)?.path || functionName || "Exécution Edge");
        const category = inferLogCategory([action, targetType, targetId, summary].join(" "));

        return {
          id: String(row.id),
          source: "edge",
          createdAt: String(row.created_at),
          action,
          functionName,
          category,
          status: normalizeAuditStatus(row.status),
          actorLabel,
          actorType: inferActorType(actorLabel),
          targetType,
          targetId,
          summary,
        };
      });

      const normalizedDataLogs: AuditEntry[] = ((dataResponse.data || []) as any[]).map((row) => {
        const action = String(row.action || "mutation");
        const targetType = String(row.entity_type || "entity");
        const targetId = String(row.entity_id || "");
        const summary = `${targetType} ${targetId}`.trim();
        return {
          id: String(row.id),
          source: "data",
          createdAt: String(row.created_at),
          action,
          functionName: targetType,
          category: inferLogCategory([action, targetType, targetId].join(" ")),
          status: "info",
          actorLabel: String(row.user_id || "utilisateur"),
          actorType: "user",
          targetType,
          targetId,
          summary,
        };
      });

      return [...normalizedEdgeLogs, ...normalizedDataLogs];
    },
  });

  const functionOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.functionName).filter(Boolean))).sort();
  }, [logs]);

  const targetTypeOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.targetType).filter(Boolean))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs
      .filter((log) => {
        const matchesSource = sourceFilter === "all" || log.source === sourceFilter;
        const matchesStatus = statusFilter === "all" || log.status === statusFilter;
        const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
        const matchesActor = actorFilter === "all" || log.actorType === actorFilter;
        const matchesFunction = functionFilter === "all" || log.functionName === functionFilter;
        const matchesTargetType = targetTypeFilter === "all" || log.targetType === targetTypeFilter;
        const haystack = [log.action, log.functionName, log.actorLabel, log.targetType, log.targetId, log.summary, log.category]
          .join(" ")
          .toLowerCase();

        return matchesSource && matchesStatus && matchesCategory && matchesActor && matchesFunction && matchesTargetType && (!term || haystack.includes(term));
      })
      .sort((left, right) => {
        const diff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
        return sortOrder === "newest" ? diff : -diff;
      });
  }, [logs, search, sourceFilter, statusFilter, categoryFilter, actorFilter, functionFilter, targetTypeFilter, sortOrder]);

  const stats = useMemo(() => {
    const last24hThreshold = Date.now() - 24 * 60 * 60 * 1000;
    return {
      total: logs.length,
      filtered: filteredLogs.length,
      edge: logs.filter((log) => log.source === "edge").length,
      failures24h: logs.filter((log) => log.status === "failure" && Date.parse(log.createdAt) >= last24hThreshold).length,
      schedulers24h: logs.filter((log) => log.actorType === "scheduler" && Date.parse(log.createdAt) >= last24hThreshold).length,
      paymentAnomalies: paymentIntegrity?.total || 0,
      paymentCritical: paymentIntegrity?.critical || 0,
      securityCritical: securityAbuse?.counts?.critical || 0,
    };
  }, [logs, filteredLogs.length, paymentIntegrity, securityAbuse]);

  const healthStatus = normalizeHealthStatus(productionHealth?.status);
  const securityAbuseStatus = normalizeHealthStatus(securityAbuse?.status);
  const paymentAnomalies = paymentIntegrity?.items || [];
  const securityAbuseSections = [
    {
      title: "Créations de comptes",
      value: formatNumber(securityAbuse?.massAccountCreation?.newAccounts),
      message: securityAbuse?.massAccountCreation?.message,
      status: securityAbuse?.massAccountCreation?.status,
    },
    {
      title: "Échecs sensibles",
      value: formatNumber(securityAbuse?.sensitiveEndpointFailures?.totalFailures),
      message: securityAbuse?.sensitiveEndpointFailures?.message,
      status: securityAbuse?.sensitiveEndpointFailures?.status,
    },
    {
      title: "Tests de cartes",
      value: formatNumber(securityAbuse?.cardTesting?.failedPaymentTransactions),
      message: securityAbuse?.cardTesting?.message,
      status: securityAbuse?.cardTesting?.status,
    },
    {
      title: "Uploads massifs",
      value: formatNumber(securityAbuse?.massUploads?.totalUploads),
      message: securityAbuse?.massUploads?.message,
      status: securityAbuse?.massUploads?.status,
    },
    {
      title: "Actions auditées",
      value: formatNumber(securityAbuse?.sensitiveActions?.auditedActions),
      message: securityAbuse?.sensitiveActions?.message,
      status: securityAbuse?.sensitiveActions?.status,
    },
  ];
  const hasActiveFilters = search || sourceFilter !== "all" || statusFilter !== "all" || timeRange !== "24h" || categoryFilter !== "all" || actorFilter !== "all" || functionFilter !== "all" || targetTypeFilter !== "all" || sortOrder !== "newest" || customStart || customEnd;

  const resetFilters = () => {
    setSearch("");
    setSourceFilter("all");
    setStatusFilter("all");
    setTimeRange("24h");
    setCustomStart("");
    setCustomEnd("");
    setCategoryFilter("all");
    setActorFilter("all");
    setFunctionFilter("all");
    setTargetTypeFilter("all");
    setSortOrder("newest");
  };

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Sécurité admin"
        title="Audit et santé production"
        description="Historique des logs Edge et data avec filtres par horaire, type, statut, fonction, acteur, cible et recherche globale."
        icon={Shield}
        tone="rose"
        visualLabel="Audit"
        stats={[
          { label: "Santé", value: HEALTH_LABELS[healthStatus], icon: Activity },
          { label: "Logs filtrés", value: stats.filtered, icon: Search },
          { label: "Sécurité", value: stats.securityCritical, icon: AlertTriangle },
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
            {productionHealth?.checkedAt ? <p className="text-xs text-muted-foreground">Dernière vérification : {formatDateTime(productionHealth.checkedAt)}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchProductionHealth()} disabled={productionHealthLoading}>
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
            <div className="grid gap-3 md:grid-cols-3"><div className="h-16 rounded-lg bg-muted animate-pulse" /><div className="h-16 rounded-lg bg-muted animate-pulse" /><div className="h-16 rounded-lg bg-muted animate-pulse" /></div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Score</p><p className="mt-2 text-2xl font-bold">{productionHealth?.score ?? 0}/100</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Critiques</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.critical)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">À surveiller</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.watch)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Crons suivis</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.cronJobs)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Edge suivies</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.edgeFunctions)}</p></div>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-semibold"><TimerReset className="h-4 w-4" />Cron jobs</h3><p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.cron?.jobs?.length)} jobs suivis.</p><HealthBadge status={productionHealth?.cron?.status} /></div>
                <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-semibold"><TerminalSquare className="h-4 w-4" />Edge Functions critiques</h3><p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.edgeFunctions?.functions?.length)} fonctions suivies.</p><HealthBadge status={productionHealth?.edgeFunctions?.status} /></div>
                <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" />Stripe webhook</h3><p className="mt-2 text-sm text-muted-foreground">{productionHealth?.stripe?.message || "Aucun signal Stripe disponible."}</p><HealthBadge status={productionHealth?.stripe?.status} /></div>
                <div className="rounded-lg border p-4"><h3 className="font-semibold">Supabase advisors</h3><p className="mt-2 text-sm text-muted-foreground">{productionHealth?.advisors?.message || "Aucun snapshot synchronisé."}</p><HealthBadge status={productionHealth?.advisors?.status} /></div>
                <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Variables critiques</h3><p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.configuration?.checks?.length)} contrôles configurés.</p><HealthBadge status={productionHealth?.configuration?.status} /></div>
                <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Alertes prioritaires</h3><p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.alerts?.length)} signalements actifs.</p></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={securityAbuseStatus === "critical" ? "border-destructive/40" : securityAbuseStatus === "watch" ? "border-amber-500/35" : undefined}>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Surveillance sécurité
              </CardTitle>
              <HealthBadge status={securityAbuse?.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Création massive de comptes, échecs sur endpoints sensibles, signaux de tests de cartes, uploads massifs et actions sensibles auditées.
            </p>
            {securityAbuse?.checkedAt ? <p className="text-xs text-muted-foreground">Dernière vérification : {formatDateTime(securityAbuse.checkedAt)}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchSecurityAbuse()} disabled={securityAbuseLoading}>
            <RefreshCw className="h-4 w-4" />
            Vérifier
          </Button>
        </CardHeader>
        <CardContent>
          {securityAbuseError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger la surveillance sécurité. Vérifiez que `admin_get_security_abuse_summary` est déployée.
            </div>
          ) : securityAbuseLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {securityAbuseSections.map((section) => (
                <div key={section.title} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{section.title}</p>
                    <HealthBadge status={section.status} />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{section.value}</p>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{section.message || "Aucun signal disponible."}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricCard label="Total chargé" value={stats.total} icon={Shield} />
        <MetricCard label="Résultats filtrés" value={stats.filtered} icon={Search} />
        <MetricCard label="Logs Edge" value={stats.edge} icon={TerminalSquare} />
        <MetricCard label="Erreurs 24h" value={stats.failures24h} icon={AlertTriangle} />
        <MetricCard label="Jobs planifiés 24h" value={stats.schedulers24h} icon={Clock3} />
      </div>

      <Card className={stats.paymentCritical > 0 ? "border-destructive/40" : undefined}>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" />Intégrité paiements</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Anomalies de paiements, commandes et réservations sur les {paymentIntegrity?.windowHours || 48} dernières heures.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchPaymentIntegrity()} disabled={paymentIntegrityLoading}>
            <RefreshCw className="h-4 w-4" />
            Vérifier
          </Button>
        </CardHeader>
        <CardContent>
          {paymentIntegrityError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Impossible de charger les anomalies de paiement.</div>
          ) : paymentIntegrityLoading ? (
            <div className="h-14 rounded-lg bg-muted animate-pulse" />
          ) : paymentAnomalies.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">Aucune anomalie critique détectée.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Sévérité</TableHead><TableHead>Type</TableHead><TableHead>Cible</TableHead><TableHead>Restaurant</TableHead><TableHead>Résumé</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paymentAnomalies.slice(0, 12).map((item, index) => (
                    <TableRow key={`${item.kind}-${getPaymentTarget(item)}-${index}`}>
                      <TableCell><Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{item.severity || "medium"}</Badge></TableCell>
                      <TableCell className="font-medium">{item.kind || "anomalie"}</TableCell>
                      <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground">{getPaymentTarget(item)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">{item.restaurant_id || "-"}</TableCell>
                      <TableCell className="max-w-[28rem] text-xs text-muted-foreground">{item.title || item.status || item.payment_status || "Anomalie à vérifier"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" />Filtres des logs</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Filtrez par horaires, source, type, fonction, statut, acteur, cible et mot-clé.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchLogs()} disabled={isLoading}><RefreshCw className="h-4 w-4" />Rafraîchir</Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>Réinitialiser les filtres</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <div className="space-y-2"><Label>Recherche</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action, fonction, utilisateur, restaurant, commande, erreur..." /></div>
            <div className="space-y-2"><Label>Horaire</Label><Select value={timeRange} onValueChange={(value) => setTimeRange(value as AuditTimeRange)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIME_RANGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Source</Label><Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as AuditSource)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les sources</SelectItem><SelectItem value="edge">Exécutions Edge</SelectItem><SelectItem value="data">Historique data</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Statut</Label><Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AuditStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="success">Succès</SelectItem><SelectItem value="failure">Échec</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent></Select></div>
          </div>

          {timeRange === "custom" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label>Début</Label><Input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="space-y-2"><Label>Fin</Label><Input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2"><Label>Type</Label><Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as AuditCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Fonction / source technique</Label><Select value={functionFilter} onValueChange={setFunctionFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les fonctions</SelectItem>{functionOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Acteur</Label><Select value={actorFilter} onValueChange={(value) => setActorFilter(value as AuditActorFilter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les acteurs</SelectItem><SelectItem value="scheduler">Scheduler</SelectItem><SelectItem value="service_role">Service role</SelectItem><SelectItem value="user">Utilisateur</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Cible</Label><Select value={targetTypeFilter} onValueChange={setTargetTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les cibles</SelectItem>{targetTypeOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Tri</Label><Select value={sortOrder} onValueChange={(value) => setSortOrder(value as AuditSort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Plus récent</SelectItem><SelectItem value="oldest">Plus ancien</SelectItem></SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card><CardContent className="py-10 text-center text-destructive">Impossible de charger les logs d’audit.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-3"><div className="h-20 rounded-xl bg-muted animate-pulse" /><div className="h-20 rounded-xl bg-muted animate-pulse" /><div className="h-20 rounded-xl bg-muted animate-pulse" /></div>
      ) : (
        <Card>
          <CardContent className="py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quand</TableHead><TableHead>Source</TableHead><TableHead>Type</TableHead><TableHead>Action</TableHead><TableHead>Acteur</TableHead><TableHead>Statut</TableHead><TableHead>Cible</TableHead><TableHead>Résumé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 300).map((log, index) => (
                    <TableRow key={`${log.source}-${log.id}-${index}`}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell><Badge variant={log.source === "edge" ? "default" : "outline"}>{log.source === "edge" ? "Edge" : "Data"}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{CATEGORY_LABELS[log.category]}</Badge></TableCell>
                      <TableCell className="min-w-52 font-medium"><div>{log.action}</div><div className="text-xs text-muted-foreground">{log.functionName}</div></TableCell>
                      <TableCell className="text-xs text-muted-foreground"><div>{log.actorLabel}</div><div>{log.actorType}</div></TableCell>
                      <TableCell><Badge variant={log.status === "failure" ? "destructive" : log.status === "success" ? "secondary" : "outline"}>{log.status}</Badge></TableCell>
                      <TableCell className="text-xs"><div>{log.targetType}</div>{log.targetId ? <div className="max-w-[14rem] truncate text-muted-foreground">{log.targetId}</div> : null}</TableCell>
                      <TableCell className="max-w-[32rem] text-xs text-muted-foreground">{log.summary}</TableCell>
                    </TableRow>
                  ))}
                  {filteredLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Aucun log ne correspond au filtre courant.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {filteredLogs.length > 300 ? <p className="border-t py-3 text-xs text-muted-foreground">Affichage limité aux 300 premiers résultats. Affinez les filtres pour réduire la liste.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
