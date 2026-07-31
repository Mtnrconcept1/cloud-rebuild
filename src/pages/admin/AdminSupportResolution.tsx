import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  analyzeSupportIncident,
  executeSupportResolutionAction,
  listSupportResolutionWorkspace,
  rejectSupportResolutionAction,
  type SupportIncidentSummary,
  type SupportResolutionAction,
} from "@/lib/tokIntelligence";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function priorityBadge(priority: string) {
  const variant =
    priority === "urgent" || priority === "high"
      ? "destructive"
      : priority === "normal"
      ? "secondary"
      : "outline";
  return <Badge variant={variant}>{priority}</Badge>;
}

function actionStatusBadge(status: string) {
  const variant =
    status === "completed"
      ? "default"
      : status === "failed" || status === "rejected"
      ? "destructive"
      : "secondary";
  const labels: Record<string, string> = {
    proposed: "Proposée",
    approved: "Approuvée",
    executing: "En cours",
    completed: "Exécutée",
    rejected: "Refusée",
    manual_required: "Traitement humain",
    failed: "Échec",
  };
  return <Badge variant={variant}>{labels[status] || status}</Badge>;
}

function incidentLabel(incident: SupportIncidentSummary) {
  return `#${incident.id.slice(0, 8).toUpperCase()}`;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((entry) => entry.trim()).filter(Boolean)
    : [];
}

export default function AdminSupportResolution() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [analysisPrompt, setAnalysisPrompt] = useState(
    "Établis la chronologie, les preuves, la cause probable et les actions sûres. Ne propose aucune action financière automatique.",
  );
  const selectedIncidentId = searchParams.get("incident");

  const workspaceQuery = useQuery({
    queryKey: ["support-resolution-workspace"],
    queryFn: () => listSupportResolutionWorkspace(),
    refetchInterval: 30_000,
  });

  const incidents = workspaceQuery.data?.incidents || [];
  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ||
    incidents[0] ||
    null;

  const selectedRuns = useMemo(
    () =>
      (workspaceQuery.data?.runs || []).filter(
        (run) => run.incident_id === selectedIncident?.id,
      ),
    [workspaceQuery.data?.runs, selectedIncident?.id],
  );
  const latestRun = selectedRuns[0] || null;
  const selectedActions = useMemo(
    () =>
      (workspaceQuery.data?.actions || []).filter(
        (action) => action.run_id === latestRun?.id,
      ),
    [workspaceQuery.data?.actions, latestRun?.id],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["support-resolution-workspace"],
    });
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIncident) throw new Error("Sélectionnez un incident.");
      return analyzeSupportIncident({
        incidentId: selectedIncident.id,
        prompt: analysisPrompt,
      });
    },
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Diagnostic créé",
        description:
          "Les actions proposées restent soumises aux garde-fous et validations.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analyse impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (action: SupportResolutionAction) => {
      const confirmed = action.requires_approval
        ? window.confirm(
            `Confirmer l’action « ${action.label} » ? Cette décision sera journalisée.`,
          )
        : true;
      if (!confirmed) throw new Error("Action annulée.");
      return executeSupportResolutionAction({
        actionId: action.id,
        confirmed,
      });
    },
    onSuccess: async ({ idempotent }) => {
      await refresh();
      toast({
        title: idempotent ? "Action déjà exécutée" : "Action exécutée",
        description: idempotent
          ? "Le résultat existant a été conservé."
          : "Le résultat a été enregistré dans le journal de résolution.",
      });
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "Action annulée.") return;
      toast({
        title: "Exécution impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (action: SupportResolutionAction) =>
      rejectSupportResolutionAction({
        actionId: action.id,
        reason: "Refusée depuis le centre Support & Resolution.",
      }),
    onSuccess: async () => {
      await refresh();
      toast({
        title: "Action refusée",
        description: "La décision a été journalisée.",
      });
    },
    onError: (error) => {
      toast({
        title: "Refus impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const selectIncident = (incident: SupportIncidentSummary) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("incident", incident.id);
      return next;
    });
  };

  const analysis = latestRun?.analysis || {};
  const confirmedFacts = stringArray(analysis.confirmed_facts);
  const uncertainties = stringArray(analysis.uncertainties);
  const warnings = stringArray(analysis.warnings);
  const probableCause =
    typeof analysis.probable_cause === "string"
      ? analysis.probable_cause
      : "";

  return (
    <div className="container space-y-6 py-6">
      <div className="rounded-3xl border bg-gradient-to-br from-slate-50 via-background to-orange-50 p-6 shadow-sm dark:from-slate-950/40 dark:to-orange-950/15">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Bot className="h-4 w-4" />
          TOK Support & Resolution
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold">
          Diagnostiquer puis résoudre avec validation
        </h1>
        <p className="mt-3 max-w-4xl text-muted-foreground">
          L’agent rassemble la chronologie, les preuves et les options. Les
          remboursements, avoirs, clôtures et changements sensibles restent
          contrôlés par un administrateur.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Incidents ouverts</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => workspaceQuery.refetch()}
              disabled={workspaceQuery.isFetching}
            >
              <RefreshCcw
                className={`h-4 w-4 ${
                  workspaceQuery.isFetching ? "animate-spin" : ""
                }`}
              />
            </Button>
          </CardHeader>
          <CardContent className="max-h-[68vh] space-y-2 overflow-y-auto">
            {workspaceQuery.isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun incident ouvert.
              </p>
            ) : (
              incidents.map((incident) => (
                <button
                  type="button"
                  key={incident.id}
                  onClick={() => selectIncident(incident)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedIncident?.id === incident.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {incidentLabel(incident)}
                    </span>
                    {priorityBadge(incident.priority)}
                    <Badge variant="outline">{incident.status}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 font-semibold">
                    {incident.subject}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(incident.updated_at)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!selectedIncident ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Sélectionnez un incident.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {incidentLabel(selectedIncident)}
                      </p>
                      <CardTitle className="mt-2">
                        {selectedIncident.subject}
                      </CardTitle>
                    </div>
                    <div className="flex gap-2">
                      {priorityBadge(selectedIncident.priority)}
                      <Badge variant="outline">
                        {selectedIncident.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedIncident.description || "Aucune description."}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Catégorie</p>
                      <p className="mt-1 font-semibold">
                        {selectedIncident.category}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">Commande</p>
                      <p className="mt-1 font-mono text-xs">
                        {selectedIncident.order_id?.slice(0, 8) || "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Réservation
                      </p>
                      <p className="mt-1 font-mono text-xs">
                        {selectedIncident.reservation_id?.slice(0, 8) || "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Nouveau diagnostic</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={analysisPrompt}
                    onChange={(event) =>
                      setAnalysisPrompt(event.target.value)
                    }
                    rows={4}
                    maxLength={3000}
                  />
                  <Button
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                    )}
                    Analyser le dossier
                  </Button>
                </CardContent>
              </Card>

              {latestRun ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle>{latestRun.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="secondary">
                          Risque {latestRun.risk_level}
                        </Badge>
                        <Badge variant="outline">
                          Confiance{" "}
                          {latestRun.confidence === null
                            ? "—"
                            : `${Math.round(latestRun.confidence * 100)} %`}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {latestRun.executive_summary}
                    </p>

                    {confirmedFacts.length ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:bg-emerald-950/20">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          Faits confirmés
                        </div>
                        <ul className="space-y-1 text-sm">
                          {confirmedFacts.map((fact) => (
                            <li key={fact}>• {fact}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {uncertainties.length ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/20">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          Incertitudes
                        </div>
                        <ul className="space-y-1 text-sm">
                          {uncertainties.map((entry) => (
                            <li key={entry}>• {entry}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {probableCause ? (
                      <div className="rounded-2xl border p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Cause probable
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm">
                          {probableCause}
                        </p>
                      </div>
                    ) : null}

                    {warnings.length ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:bg-red-950/20">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <ShieldAlert className="h-4 w-4" />
                          Garde-fous
                        </div>
                        <ul className="space-y-1 text-sm">
                          {warnings.map((entry) => (
                            <li key={entry}>• {entry}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Résumé partageable avec le client
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {latestRun.customer_safe_summary}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {selectedActions.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Actions proposées</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedActions.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-2xl border p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{action.label}</p>
                              {actionStatusBadge(action.status)}
                              {action.requires_approval ? (
                                <Badge variant="outline">
                                  Confirmation requise
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {action.reason}
                            </p>
                            {action.last_error ? (
                              <p className="mt-2 text-sm text-destructive">
                                {action.last_error}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {action.status === "proposed" ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    executeMutation.mutate(action)
                                  }
                                  disabled={executeMutation.isPending}
                                >
                                  <UserCheck className="mr-1 h-4 w-4" />
                                  Exécuter
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    rejectMutation.mutate(action)
                                  }
                                  disabled={rejectMutation.isPending}
                                >
                                  <XCircle className="mr-1 h-4 w-4" />
                                  Refuser
                                </Button>
                              </>
                            ) : null}
                            {action.status === "manual_required" ? (
                              <Badge variant="destructive">
                                Aucune exécution IA
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
