import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, RefreshCw, Shield, TerminalSquare } from "lucide-react";

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
  items: PaymentAnomaly[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAnomalyKind(kind: string) {
  const labels: Record<string, string> = {
    stale_pending_order: "Commande paiement en attente",
    captured_order_without_charge: "Commande capturée sans transaction",
    succeeded_order_charge_without_order: "Paiement réussi sans commande",
    paid_campaign_not_active: "Campagne payée non active",
    paid_campaign_without_transaction: "Campagne payée sans transaction",
    zero_attente_transaction_without_reservation: "Zero Attente sans réservation",
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
          : String((row.request_metadata as Record<string, unknown> | null)?.path || row.function_name || "Execution edge"),
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
        badge="Securite admin"
        title="Audit et securite"
        description="Historique des executions edge sensibles, mutations historisees et anomalies de paiement a verifier."
        icon={Shield}
        tone="rose"
        visualLabel="Audit"
        stats={[
          { label: "Logs", value: stats.total, icon: Shield },
          { label: "Edge", value: stats.edge, icon: TerminalSquare },
          { label: "Erreurs 24h", value: stats.failures24h, icon: AlertTriangle },
          { label: "Anomalies paiement", value: stats.paymentAnomalies, icon: CreditCard },
        ]}
      />

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
            <CardTitle className="text-xs font-medium text-muted-foreground">Logs edge</CardTitle>
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
            <CardTitle className="text-xs font-medium text-muted-foreground">Jobs planifies 24h</CardTitle>
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
              Integrite paiements
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Detection automatique des paiements orphelins, commandes en attente, campagnes payees non actives et reservations introuvables.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => refetchPaymentIntegrity()} disabled={paymentIntegrityLoading}>
            <RefreshCw className="h-4 w-4" />
            Verifier
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
              Aucune anomalie critique detectee sur les {paymentIntegrity?.windowHours || 48} dernieres heures.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severite</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Resume</TableHead>
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
              <SelectItem value="edge">Executions edge</SelectItem>
              <SelectItem value="data">Historique data</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "success" | "failure" | "info")}>
            <SelectTrigger className="md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="success">Succes</SelectItem>
              <SelectItem value="failure">Echec</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Impossible de charger les logs d'audit.
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
                  <TableHead>Resume</TableHead>
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
