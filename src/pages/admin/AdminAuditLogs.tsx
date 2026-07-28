import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import AdminLogResetButton from "@/components/admin/AdminLogResetButton";
import { getSupabase } from "@/integrations/supabase/client";
import { describeAuditLog, type AuditNarrative } from "@/lib/admin/auditLogNarrative";

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
  actorUserId?: string | null;
  actorRoles?: string[];
  isServiceRole?: boolean;
  requestMetadata?: unknown;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  raw?: unknown;
  /** Raw technical error, kept verbatim for the detail panel. */
  errorMessage?: string | null;
  /** Plain-French reading of the row, computed once at load time. */
  narrative: AuditNarrative;
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

type AdminDetailField = {
  label: string;
  value: unknown;
};

type AdminDetail = {
  title: string;
  subtitle?: string;
  status?: string | null;
  fields: AdminDetailField[];
  raw?: unknown;
  rawTitle?: string;
  explanation?: string;
  recommendation?: string;
  destination?: string | null;
  destinationLabel?: string;
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

function calculateHealthScore(report?: ProductionHealthReport) {
  const ok = Math.max(0, Number(report?.counts?.ok || 0));
  const watch = Math.max(0, Number(report?.counts?.watch || 0));
  const critical = Math.max(0, Number(report?.counts?.critical || 0));
  const total = ok + watch + critical;
  if (total === 0) return null;
  return Math.round(((ok * 100) + (watch * 60)) / total);
}

function UrgentIndicator({ show, label = "Urgence critique à régler" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-xl font-black text-white shadow-lg shadow-red-600/30 ring-4 ring-red-100 dark:ring-red-950"
    >
      !
    </span>
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

function isConcreteHealthStatus(value?: string | null): value is HealthStatus {
  return value === "ok" || value === "watch" || value === "critical";
}

function formatExactDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length > 0 ? value.map(formatDetailValue).join(", ") : "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[objet non sérialisable]";
    }
  }
  return String(value);
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pickMetadataValue(metadata: unknown, keys: string[]) {
  const record = asRecord(metadata);
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function getLogMetadata(log: AuditEntry) {
  return {
    ...asRecord(log.oldData),
    ...asRecord(log.newData),
    ...asRecord(log.requestMetadata),
  };
}

function getLogTransactionReference(log: AuditEntry) {
  const metadataValue = pickMetadataValue(getLogMetadata(log), [
    "payment_transaction_id",
    "transaction_id",
    "stripe_payment_intent_id",
    "payment_intent",
    "charge_id",
    "stripe_session_id",
    "checkout_session_id",
  ]);

  if (metadataValue) return metadataValue;
  return /payment|stripe|checkout|charge/i.test(`${log.targetType} ${log.action}`) ? log.targetId : null;
}

function getLogOrderReference(log: AuditEntry) {
  const metadataValue = pickMetadataValue(getLogMetadata(log), ["order_id", "order_number", "commande_id"]);
  if (metadataValue) return metadataValue;
  return /order|commande/i.test(`${log.targetType} ${log.action}`) ? log.targetId : null;
}

function getLogReservationReference(log: AuditEntry) {
  const metadataValue = pickMetadataValue(getLogMetadata(log), ["reservation_id", "booking_id"]);
  if (metadataValue) return metadataValue;
  return /reservation|booking/i.test(`${log.targetType} ${log.action}`) ? log.targetId : null;
}

function humanizeTechnicalLabel(value: string) {
  const normalized = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Événement sans libellé";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getAuditNarrative(log: AuditEntry): AuditNarrative {
  return log.narrative;
}

/**
 * Category-level fallback used only when the narrative engine could not name a
 * precise cause, so the operator still gets a domain-aware next step.
 */
function getCategoryFallbackRecommendation(log: AuditEntry) {
  if (log.category === "payment") return "Contrôler la session Stripe, le PaymentIntent et la commande liée. Relancer la réconciliation avant tout remboursement manuel.";
  if (log.category === "security") return "Contrôler l’identité, l’adresse IP, les rôles et la fréquence des tentatives. Révoquer la session ou bloquer le flux si l’action n’est pas légitime.";
  if (log.category === "ai") return "Contrôler le quota, les crédits, le fournisseur IA et le journal d’usage. Ne relancer la génération qu’après avoir identifié la cause.";
  if (log.category === "order") return "Ouvrir l’opération concernée, comparer les statuts commande, paiement, restaurant et dispatch, puis appliquer uniquement la transition autorisée.";
  return null;
}

function getAuditDestination(log: AuditEntry) {
  const order = getLogOrderReference(log);
  if (order) return `/admin/commandes-reservations?tab=orders&operation=${encodeURIComponent(String(order))}`;
  const reservation = getLogReservationReference(log);
  if (reservation) return `/admin/commandes-reservations?tab=reservations&operation=${encodeURIComponent(String(reservation))}`;
  if (log.category === "payment") return "/admin/commandes-reservations?view=payments";
  if (log.category === "ai") return "/admin/ai-operations";
  if (log.category === "restaurant") return "/admin/restaurants";
  return null;
}

function buildPaymentDetail(item: NonNullable<PaymentIntegrityReport["items"]>[number], index: number): AdminDetail {
  const operationId = item.order_id || item.order_number || item.reservation_id;
  return {
    title: item.title || humanizeTechnicalLabel(item.kind || `Anomalie paiement ${index + 1}`),
    subtitle: "Intégrité paiements",
    status: item.severity || "medium",
    fields: [
      { label: "Sévérité", value: item.severity || "medium" },
      { label: "Type", value: item.kind || "anomalie" },
      { label: "Transaction", value: item.payment_transaction_id },
      { label: "Commande", value: item.order_number || item.order_id },
      { label: "Réservation", value: item.reservation_id },
      { label: "Restaurant", value: item.restaurant_id },
      { label: "Statut commande", value: item.status },
      { label: "Statut paiement", value: item.payment_status },
      { label: "Résumé", value: item.title || "Anomalie à vérifier" },
    ],
    raw: item,
    rawTitle: "Payload anomalie",
    explanation: `Le contrôle a détecté une incohérence entre le paiement et ${item.order_id || item.order_number ? "la commande" : item.reservation_id ? "la réservation" : "l’opération métier associée"}. Cette anomalie peut empêcher le support de confirmer, livrer ou rembourser correctement l’opération.`,
    recommendation: "Comparer le statut Stripe au statut TOK, retrouver la transaction autoritaire, puis réconcilier l’opération. Ne créez pas manuellement une seconde commande et ne remboursez pas avant d’avoir exclu un traitement webhook encore en cours.",
    destination: operationId
      ? `/admin/commandes-reservations?tab=${item.reservation_id ? "reservations" : "orders"}&operation=${encodeURIComponent(String(operationId))}`
      : "/admin/commandes-reservations?view=payments",
    destinationLabel: "Ouvrir l’opération concernée",
  };
}

function buildAuditDetail(log: AuditEntry): AdminDetail {
  const metadata = getLogMetadata(log);
  const userLabel = pickMetadataValue(metadata, [
    "actor_email",
    "user_email",
    "customer_email",
    "email",
    "full_name",
    "user_name",
    "customer_name",
    "profile_name",
  ]);
  const restaurantLabel = pickMetadataValue(metadata, [
    "restaurant_name",
    "restaurant_id",
  ]);
  const courierLabel = pickMetadataValue(metadata, [
    "courier_name",
    "courier_email",
    "courier_id",
    "livreur_id",
  ]);

  const narrative = getAuditNarrative(log);

  return {
    title: narrative.headline,
    subtitle: `${log.source === "edge" ? "Execution Edge" : "Historique data"} · ${CATEGORY_LABELS[log.category]}`,
    status: log.status,
    fields: [
      { label: "Ce que fait cette opération", value: narrative.what },
      { label: "Résultat", value: narrative.outcome },
      ...(narrative.cause ? [{ label: "Pourquoi cela s’est produit", value: narrative.cause }] : []),
      { label: "Conséquence", value: narrative.impact },
      { label: "Moment précis", value: formatExactDateTime(log.createdAt) },
      { label: "Source technique", value: log.source === "edge" ? "Edge Function" : "Audit data" },
      { label: "Fonction / table", value: log.functionName },
      { label: "Statut", value: log.status },
      { label: "Compte déclencheur", value: log.actorLabel },
      { label: "ID utilisateur", value: log.actorUserId },
      { label: "Rôles acteur", value: log.actorRoles },
      { label: "Nom ou email utilisateur", value: userLabel },
      { label: "Restaurant concerné", value: restaurantLabel },
      { label: "Livreur concerné", value: courierLabel },
      { label: "Transaction", value: getLogTransactionReference(log) },
      { label: "Commande", value: getLogOrderReference(log) },
      { label: "Réservation", value: getLogReservationReference(log) },
      { label: "Cible technique", value: log.targetType },
      { label: "ID cible", value: log.targetId },
      { label: "IP", value: log.ipAddress || pickMetadataValue(log.requestMetadata, ["ip", "ip_address"]) },
      { label: "Message technique brut", value: log.errorMessage || log.summary },
    ],
    raw: {
      request_metadata: log.requestMetadata,
      old_data: log.oldData,
      new_data: log.newData,
      raw: log.raw,
    },
    rawTitle: "Métadonnées complètes",
    explanation: [narrative.what, narrative.cause, narrative.impact].filter(Boolean).join(" "),
    recommendation: narrative.causeIdentified
      ? narrative.recommendation
      : getCategoryFallbackRecommendation(log) || narrative.recommendation,
    destination: getAuditDestination(log),
    destinationLabel: "Voir la zone concernée",
  };
}

function buildHealthDetail(
  title: string,
  status: string | null | undefined,
  fields: AdminDetailField[],
  raw?: unknown,
): AdminDetail {
  return {
    title,
    subtitle: "Santé production",
    status,
    fields,
    raw,
    rawTitle: "Données de contrôle",
    explanation: normalizeHealthStatus(status) === "ok"
      ? "Ce contrôle confirme que la zone surveillée fonctionne dans les seuils attendus."
      : `Ce contrôle signale un point ${normalizeHealthStatus(status) === "critical" ? "critique" : "à surveiller"} dans la santé de production. Les champs ci-dessous permettent d’identifier le composant concerné.`,
    recommendation: normalizeHealthStatus(status) === "ok"
      ? "Aucun changement immédiat n’est requis. Conserver la surveillance et vérifier toute évolution du statut."
      : "Ouvrir les données de contrôle, identifier le composant en échec, vérifier sa configuration et ses derniers logs, puis relancer le contrôle après correction.",
  };
}

function DetailStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  if (isConcreteHealthStatus(status)) return <HealthBadge status={status} />;
  return (
    <Badge variant={status === "failure" || status === "critical" ? "destructive" : "outline"}>
      {status}
    </Badge>
  );
}

function AdminDetailDialog({
  detail,
  onClose,
  onNavigate,
}: {
  detail: AdminDetail | null;
  onClose: () => void;
  onNavigate: (destination: string) => void;
}) {
  return (
    <Dialog open={!!detail} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{detail?.title || "Détail"}</span>
            <DetailStatusBadge status={detail?.status} />
          </DialogTitle>
          <DialogDescription>
            {detail?.subtitle || "Détail précis du signal admin sélectionné."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {detail?.explanation ? (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Ce que ce signal signifie</p>
              <p className="mt-2 text-sm leading-relaxed">{detail.explanation}</p>
            </div>
          ) : null}
          {detail?.recommendation ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Changements ou vérifications à effectuer</p>
              <p className="mt-2 text-sm leading-relaxed">{detail.recommendation}</p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {(detail?.fields || []).map((field) => (
              <div key={field.label} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {field.label}
                </p>
                <p className="mt-1 break-words text-sm font-medium">
                  {formatDetailValue(field.value)}
                </p>
              </div>
            ))}
          </div>

          {detail?.raw !== undefined ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {detail.rawTitle || "Payload complet"}
              </p>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed text-muted-foreground">
                {formatJson(detail.raw)}
              </pre>
            </div>
          ) : null}
          {detail?.destination ? (
            <Button type="button" className="w-full" onClick={() => onNavigate(detail.destination!)}>
              {detail.destinationLabel || "Ouvrir la zone concernée"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAuditLogs() {
  const navigate = useNavigate();
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
  const [selectedDetail, setSelectedDetail] = useState<AdminDetail | null>(null);

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
        .select("id, user_id, action, entity_type, entity_id, ip_address, old_data, new_data, created_at")
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
        const status = normalizeAuditStatus(row.status);
        const actorType = inferActorType(actorLabel);

        return {
          id: String(row.id),
          source: "edge",
          createdAt: String(row.created_at),
          action,
          functionName,
          category,
          status,
          actorLabel,
          actorType,
          targetType,
          targetId,
          summary,
          narrative: describeAuditLog({
            source: "edge",
            action,
            functionName,
            status,
            actorLabel,
            actorType,
            targetType,
            targetId,
            errorMessage: row.error_message ?? null,
            metadata: asRecord(row.request_metadata),
          }),
          actorUserId: row.actor_user_id ?? null,
          actorRoles: Array.isArray(row.actor_roles) ? row.actor_roles : [],
          isServiceRole: Boolean(row.is_service_role),
          requestMetadata: row.request_metadata,
          errorMessage: row.error_message ?? null,
          raw: row,
        };
      });

      const normalizedDataLogs: AuditEntry[] = ((dataResponse.data || []) as any[]).map((row) => {
        const action = String(row.action || "mutation");
        const targetType = String(row.entity_type || "entity");
        const targetId = String(row.entity_id || "");
        const actorLabel = String(row.user_id || "utilisateur");
        const narrative = describeAuditLog({
          source: "data",
          action,
          functionName: targetType,
          status: "info",
          actorLabel,
          actorType: "user",
          targetType,
          targetId,
          metadata: { ...asRecord(row.old_data), ...asRecord(row.new_data) },
        });
        return {
          id: String(row.id),
          source: "data",
          createdAt: String(row.created_at),
          action,
          functionName: targetType,
          category: inferLogCategory([action, targetType, targetId].join(" ")),
          status: "info",
          actorLabel,
          actorType: "user",
          targetType,
          targetId,
          summary: narrative.headline,
          narrative,
          actorUserId: row.user_id ?? null,
          ipAddress: row.ip_address ?? null,
          oldData: row.old_data,
          newData: row.new_data,
          raw: row,
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
        // The narrative is searchable too, so an operator can type "supprimé"
        // or "secret" instead of guessing the technical identifier.
        const haystack = [
          log.action,
          log.functionName,
          log.actorLabel,
          log.targetType,
          log.targetId,
          log.summary,
          log.category,
          log.narrative.headline,
          log.narrative.cause,
        ]
          .filter(Boolean)
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
  const calculatedHealthScore = calculateHealthScore(productionHealth);
  const healthScoreExplanation = calculatedHealthScore === null
    ? "Score indisponible : aucun contrôle exploitable n’a encore été remonté."
    : `Score calculé sur ${formatNumber((productionHealth?.counts?.ok || 0) + (productionHealth?.counts?.watch || 0) + (productionHealth?.counts?.critical || 0))} contrôles opérationnels : OK = 100 points, à surveiller = 60 points, critique = 0 point. Moyenne pondérée arrondie : ${calculatedHealthScore}/100. Les recommandations Supabase INFO/WARN restent consultables mais sont exclues du score opérationnel. Seules les erreurs ERROR/CRITICAL entrent dans le score opérationnel.`;
  const securityAbuseStatus = normalizeHealthStatus(securityAbuse?.status);
  const paymentAnomalies = paymentIntegrity?.items || [];
  const securityAbuseSections = [
    {
      title: "Créations de comptes",
      value: formatNumber(securityAbuse?.massAccountCreation?.newAccounts),
      message: securityAbuse?.massAccountCreation?.message,
      status: securityAbuse?.massAccountCreation?.status,
      metricLabel: "Nouveaux comptes",
      raw: securityAbuse?.massAccountCreation,
    },
    {
      title: "Échecs sensibles",
      value: formatNumber(securityAbuse?.sensitiveEndpointFailures?.totalFailures),
      message: securityAbuse?.sensitiveEndpointFailures?.message,
      status: securityAbuse?.sensitiveEndpointFailures?.status,
      metricLabel: "Échecs",
      raw: securityAbuse?.sensitiveEndpointFailures,
    },
    {
      title: "Tests de cartes",
      value: formatNumber(securityAbuse?.cardTesting?.failedPaymentTransactions),
      message: securityAbuse?.cardTesting?.message,
      status: securityAbuse?.cardTesting?.status,
      metricLabel: "Transactions échouées",
      raw: securityAbuse?.cardTesting,
    },
    {
      title: "Uploads massifs",
      value: formatNumber(securityAbuse?.massUploads?.totalUploads),
      message: securityAbuse?.massUploads?.message,
      status: securityAbuse?.massUploads?.status,
      metricLabel: "Uploads",
      raw: securityAbuse?.massUploads,
    },
    {
      title: "Actions auditées",
      value: formatNumber(securityAbuse?.sensitiveActions?.auditedActions),
      message: securityAbuse?.sensitiveActions?.message,
      status: securityAbuse?.sensitiveActions?.status,
      metricLabel: "Actions auditées",
      raw: securityAbuse?.sensitiveActions,
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
          illustration={DASHBOARD_ILLUSTRATIONS.adminAudit}
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
                <button
                  type="button"
                  className="rounded-lg border bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Comprendre le score de santé", healthStatus, [
                    { label: "Score calculé", value: calculatedHealthScore === null ? "Indisponible" : `${calculatedHealthScore}/100` },
                    { label: "Contrôles OK", value: productionHealth?.counts?.ok },
                    { label: "À surveiller", value: productionHealth?.counts?.watch },
                    { label: "Critiques", value: productionHealth?.counts?.critical },
                    { label: "Règle de calcul", value: "OK = 100, à surveiller = 60, critique = 0 ; moyenne des contrôles opérationnels. Advisors INFO/WARN hors score, ERROR/CRITICAL inclus." },
                    { label: "Interprétation", value: calculatedHealthScore === null ? "Données insuffisantes" : calculatedHealthScore >= 90 ? "Plateforme saine" : calculatedHealthScore >= 70 ? "Corrections recommandées" : "Intervention prioritaire" },
                  ], productionHealth))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Score expliqué</p>
                    <UrgentIndicator show={healthStatus === "critical"} label="Le score contient au moins une urgence critique" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{calculatedHealthScore === null ? "—" : `${calculatedHealthScore}/100`}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Cliquez pour voir le calcul complet.</p>
                </button>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Critiques</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.critical)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">À surveiller</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.watch)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Crons suivis</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.cronJobs)}</p></div>
                <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Edge suivies</p><p className="mt-2 text-2xl font-bold">{formatNumber(productionHealth?.counts?.edgeFunctions)}</p></div>
              </div>
              <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4 text-sm">
                <p className="font-semibold">Comment lire le score de santé ?</p>
                <p className="mt-1 text-muted-foreground">{healthScoreExplanation}</p>
                <p className="mt-2 text-xs text-muted-foreground">Le score résume la situation, mais une seule urgence critique suffit à classer la plateforme « Critique ». Ouvrez chaque bloc marqué d’un point d’exclamation pour consulter les contrôles concernés.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Cron jobs", productionHealth?.cron?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Jobs suivis", value: productionHealth?.cron?.jobs?.length },
                    { label: "Statut", value: productionHealth?.cron?.status },
                  ], productionHealth?.cron))}
                >
                  <h3 className="flex items-center gap-2 font-semibold"><TimerReset className="h-4 w-4" />Cron jobs <UrgentIndicator show={normalizeHealthStatus(productionHealth?.cron?.status) === "critical"} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.cron?.jobs?.length)} jobs suivis.</p>
                  <HealthBadge status={productionHealth?.cron?.status} />
                </button>
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Edge Functions critiques", productionHealth?.edgeFunctions?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Fonctions suivies", value: productionHealth?.edgeFunctions?.functions?.length },
                    { label: "Statut", value: productionHealth?.edgeFunctions?.status },
                  ], productionHealth?.edgeFunctions))}
                >
                  <h3 className="flex items-center gap-2 font-semibold"><TerminalSquare className="h-4 w-4" />Edge Functions critiques <UrgentIndicator show={normalizeHealthStatus(productionHealth?.edgeFunctions?.status) === "critical"} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.edgeFunctions?.functions?.length)} fonctions suivies.</p>
                  <HealthBadge status={productionHealth?.edgeFunctions?.status} />
                </button>
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Stripe webhook", productionHealth?.stripe?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Succès 24h", value: productionHealth?.stripe?.success24h },
                    { label: "Échecs 24h", value: productionHealth?.stripe?.failures24h },
                    { label: "Ignorés 24h", value: productionHealth?.stripe?.ignored24h },
                    { label: "Résumé", value: productionHealth?.stripe?.message },
                  ], productionHealth?.stripe))}
                >
                  <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" />Stripe webhook <UrgentIndicator show={normalizeHealthStatus(productionHealth?.stripe?.status) === "critical"} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{productionHealth?.stripe?.message || "Aucun signal Stripe disponible."}</p>
                  <HealthBadge status={productionHealth?.stripe?.status} />
                </button>
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Supabase advisors", productionHealth?.advisors?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Total", value: productionHealth?.advisors?.total },
                    { label: "Critiques", value: productionHealth?.advisors?.critical },
                    { label: "Warnings", value: productionHealth?.advisors?.warning },
                    { label: "Sécurité", value: productionHealth?.advisors?.security },
                    { label: "Performance", value: productionHealth?.advisors?.performance },
                    { label: "Résumé", value: productionHealth?.advisors?.message },
                    { label: "Impact sur le score", value: (productionHealth?.advisors?.critical || 0) > 0 ? "Erreur Advisor critique incluse dans le score opérationnel." : "INFO/WARN consultables, hors score opérationnel." },
                  ], productionHealth?.advisors))}
                >
                  <h3 className="flex items-center justify-between gap-2 font-semibold"><span>Supabase advisors</span><UrgentIndicator show={normalizeHealthStatus(productionHealth?.advisors?.status) === "critical"} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{productionHealth?.advisors?.message || "Aucun snapshot synchronisé."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">INFO/WARN décrivent la posture et restent consultables ; seules les erreurs critiques affectent la santé opérationnelle.</p>
                  <HealthBadge status={productionHealth?.advisors?.status} />
                </button>
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Variables critiques", productionHealth?.configuration?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Contrôles configurés", value: productionHealth?.configuration?.checks?.length },
                    { label: "Statut", value: productionHealth?.configuration?.status },
                  ], productionHealth?.configuration))}
                >
                  <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Variables critiques <UrgentIndicator show={normalizeHealthStatus(productionHealth?.configuration?.status) === "critical"} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.configuration?.checks?.length)} contrôles configurés.</p>
                  <HealthBadge status={productionHealth?.configuration?.status} />
                </button>
                <button
                  type="button"
                  className="rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail(buildHealthDetail("Alertes prioritaires", productionHealth?.status, [
                    { label: "Dernière vérification", value: formatExactDateTime(productionHealth?.checkedAt) },
                    { label: "Signalements actifs", value: productionHealth?.alerts?.length },
                    { label: "Critiques", value: productionHealth?.counts?.critical },
                    { label: "À surveiller", value: productionHealth?.counts?.watch },
                  ], productionHealth?.alerts))}
                >
                  <h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Alertes prioritaires <UrgentIndicator show={(productionHealth?.counts?.critical || 0) > 0} /></h3>
                  <p className="mt-2 text-sm text-muted-foreground">{formatNumber(productionHealth?.alerts?.length)} signalements actifs.</p>
                </button>
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
                <button
                  key={section.title}
                  type="button"
                  className="rounded-lg border bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setSelectedDetail({
                    title: section.title,
                    subtitle: "Surveillance sécurité",
                    status: section.status,
                    fields: [
                      { label: "Dernière vérification", value: formatExactDateTime(securityAbuse?.checkedAt) },
                      { label: section.metricLabel, value: section.value },
                      { label: "Fenêtre", value: `${securityAbuse?.windowHours || 24}h` },
                      { label: "Statut", value: section.status },
                      { label: "Résumé", value: section.message || "Aucun signal disponible." },
                    ],
                    raw: section.raw,
                    rawTitle: "Signal sécurité",
                    explanation: section.message || `Le contrôle « ${section.title} » mesure les comportements inhabituels observés pendant la fenêtre sélectionnée.`,
                    recommendation: normalizeHealthStatus(section.status) === "ok"
                      ? "Aucune action immédiate. Continuer la surveillance et conserver les seuils actuels."
                      : "Vérifier les comptes, IP, acteurs et cibles concernés dans les logs filtrés. Révoquer les sessions ou limiter le flux uniquement après confirmation du comportement abusif.",
                  })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{section.title}</p>
                    <div className="flex items-center gap-2">
                      <UrgentIndicator show={normalizeHealthStatus(section.status) === "critical"} />
                      <HealthBadge status={section.status} />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{section.value}</p>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{section.message || "Aucun signal disponible."}</p>
                </button>
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
            <div className="overflow-x-hidden md:overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Sévérité</TableHead><TableHead>Type</TableHead><TableHead>Cible</TableHead><TableHead>Restaurant</TableHead><TableHead>Résumé</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paymentAnomalies.slice(0, 12).map((item, index) => (
                    <TableRow
                      key={`${item.kind}-${getPaymentTarget(item)}-${index}`}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onClick={() => setSelectedDetail(buildPaymentDetail(item, index))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDetail(buildPaymentDetail(item, index));
                        }
                      }}
                    >
                      <TableCell data-label="Sévérité"><Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{item.severity || "medium"}</Badge></TableCell>
                      <TableCell data-label="Type" className="font-medium">{item.kind || "anomalie"}</TableCell>
                      <TableCell data-label="Cible" className="text-xs text-muted-foreground md:max-w-[14rem] md:truncate">{getPaymentTarget(item)}</TableCell>
                      <TableCell data-label="Restaurant" className="text-xs text-muted-foreground md:max-w-[12rem] md:truncate">{item.restaurant_id || "-"}</TableCell>
                      <TableCell data-label="Résumé" className="text-xs text-muted-foreground md:max-w-[28rem]">{item.title || item.status || item.payment_status || "Anomalie à vérifier"}</TableCell>
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetchLogs()} disabled={isLoading}><RefreshCw className="h-4 w-4" />Rafraîchir</Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>Réinitialiser les filtres</Button>
              <AdminLogResetButton className="gap-2" />
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
            <div className="overflow-x-hidden md:overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quand</TableHead><TableHead>Source</TableHead><TableHead>Type</TableHead><TableHead>Action</TableHead><TableHead>Acteur</TableHead><TableHead>Statut</TableHead><TableHead>Cible</TableHead><TableHead>Ce qui s’est passé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 300).map((log, index) => (
                    <TableRow
                      key={`${log.source}-${log.id}-${index}`}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onClick={() => setSelectedDetail(buildAuditDetail(log))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDetail(buildAuditDetail(log));
                        }
                      }}
                    >
                      <TableCell data-label="Quand" className="text-xs text-muted-foreground md:whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell data-label="Source"><Badge variant={log.source === "edge" ? "default" : "outline"}>{log.source === "edge" ? "Edge" : "Data"}</Badge></TableCell>
                      <TableCell data-label="Type"><Badge variant="outline">{CATEGORY_LABELS[log.category]}</Badge></TableCell>
                      <TableCell data-label="Action" className="font-medium md:min-w-52"><div>{humanizeTechnicalLabel(log.action)}</div><div className="text-xs text-muted-foreground">{log.functionName}</div></TableCell>
                      <TableCell data-label="Acteur" className="text-xs text-muted-foreground"><div>{log.actorLabel}</div><div>{log.actorType}</div></TableCell>
                      <TableCell data-label="Statut"><Badge variant={log.status === "failure" ? "destructive" : log.status === "success" ? "secondary" : "outline"}>{log.status}</Badge></TableCell>
                      <TableCell data-label="Cible" className="text-xs"><div>{log.targetType}</div>{log.targetId ? <div className="break-all text-muted-foreground md:max-w-[14rem] md:truncate md:break-normal">{log.targetId}</div> : null}</TableCell>
                      <TableCell data-label="Ce qui s’est passé" className="text-xs md:max-w-[32rem]">
                        {(() => {
                          const narrative = getAuditNarrative(log);
                          return (
                            <>
                              <div className="text-foreground">{narrative.headline}</div>
                              {narrative.cause ? (
                                <div className="mt-1 text-muted-foreground">{narrative.cause}</div>
                              ) : null}
                            </>
                          );
                        })()}
                      </TableCell>
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
      <AdminDetailDialog
        detail={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onNavigate={(destination) => {
          setSelectedDetail(null);
          navigate(destination);
        }}
      />
    </div>
  );
}
