import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  SearchCheck,
  Shield,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  analyzeGuardianIncident,
  getGuardianOverview,
  verifyGuardianIncident,
  type GuardianAssessmentRecord,
  type GuardianVerificationRecord,
  type OpsIncidentSummary,
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

function incidentStatusBadge(status: string) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "pr_open" || status === "approved"
      ? "default"
      : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function severityBadge(severity: string) {
  const variant =
    severity === "critical" || severity === "high"
      ? "destructive"
      : severity === "medium"
      ? "secondary"
      : "outline";
  return <Badge variant={variant}>{severity}</Badge>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function assessmentForIncident(
  assessments: GuardianAssessmentRecord[],
  incidentId: string | null | undefined,
) {
  return assessments.find(
    (assessment) => assessment.incident_id === incidentId,
  ) || null;
}

function verificationForIncident(
  verifications: GuardianVerificationRecord[],
  incidentId: string | null | undefined,
) {
  return verifications.find(
    (verification) => verification.incident_id === incidentId,
  ) || null;
}

export default function AdminGuardian() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [analysisPrompt, setAnalysisPrompt] = useState(
    "Établis la cause probable à partir des preuves, le patch minimal, les tests, le rollback et les conditions de vérification.",
  );
  const [functionName, setFunctionName] = useState("");
  const selectedIncidentId = searchParams.get("incident");

  const overviewQuery = useQuery({
    queryKey: ["guardian-overview"],
    queryFn: getGuardianOverview,
    refetchInterval: 30_000,
  });

  const incidents = overviewQuery.data?.incidents || [];
  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ||
    incidents[0] ||
    null;
  const selectedAssessment = assessmentForIncident(
    overviewQuery.data?.assessments || [],
    selectedIncident?.id,
  );
  const selectedVerification = verificationForIncident(
    overviewQuery.data?.verifications || [],
    selectedIncident?.id,
  );

  const activeFailures = overviewQuery.data?.active_failures || [];
  const recoveredFailures = overviewQuery.data?.recovered_failures || [];
  const advisorSnapshot = overviewQuery.data?.latest_advisor_snapshot || null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIncident) throw new Error("Sélectionnez un incident.");
      return analyzeGuardianIncident({
        incidentId: selectedIncident.id,
        prompt: analysisPrompt,
      });
    },
    onSuccess: async ({ function_name }) => {
      if (function_name) setFunctionName(function_name);
      await refresh();
      toast({
        title: "Évaluation Guardian créée",
        description:
          "Aucune branche, PR, migration ou mise en production n’a été déclenchée.",
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

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIncident) throw new Error("Sélectionnez un incident.");
      return verifyGuardianIncident({
        incidentId: selectedIncident.id,
        functionName: functionName || undefined,
      });
    },
    onSuccess: async ({ verification }) => {
      await refresh();
      toast({
        title:
          verification.status === "healthy"
            ? "Signal revenu à la normale"
            : "Vérification terminée",
        description:
          "Guardian n’a pas marqué automatiquement l’incident comme résolu.",
      });
    },
    onError: (error) => {
      toast({
        title: "Vérification impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const selectIncident = (incident: OpsIncidentSummary) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("incident", incident.id);
      return next;
    });
    setFunctionName("");
  };

  const assessmentPayload = record(selectedAssessment?.assessment);
  const evidence = Array.isArray(assessmentPayload.evidence)
    ? assessmentPayload.evidence.map(record)
    : [];
  const repairPlan = Array.isArray(assessmentPayload.repair_plan)
    ? assessmentPayload.repair_plan.map(record)
    : [];
  const tests = stringArray(assessmentPayload.tests);
  const validationConditions = stringArray(
    assessmentPayload.validation_conditions,
  );
  const alternatives = stringArray(assessmentPayload.alternative_causes);
  const verificationChecks = record(selectedVerification?.checks);

  const advisorCount = useMemo(() => {
    if (!advisorSnapshot) return 0;
    const advisors = advisorSnapshot.advisors;
    if (Array.isArray(advisors)) return advisors.length;
    const value = record(advisors);
    return Object.keys(value).length;
  }, [advisorSnapshot]);

  return (
    <div className="container space-y-6 py-6">
      <div className="rounded-3xl border bg-gradient-to-br from-slate-50 via-background to-blue-50 p-6 shadow-sm dark:from-slate-950/40 dark:to-blue-950/15">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Shield className="h-4 w-4" />
          TOK Guardian
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold">
          Observer, comprendre, vérifier
        </h1>
        <p className="mt-3 max-w-4xl text-muted-foreground">
          Guardian complète la file d’incidents existante. Il analyse les
          preuves, prépare un plan réversible et contrôle le retour à la
          normale, sans jamais fusionner ni déployer automatiquement.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Incidents actifs</p>
            <p className="mt-2 text-3xl font-bold">{incidents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Échecs encore actuels
            </p>
            <p className="mt-2 text-3xl font-bold">{activeFailures.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Échecs récupérés
            </p>
            <p className="mt-2 text-3xl font-bold">{recoveredFailures.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Signaux Advisor archivés
            </p>
            <p className="mt-2 text-3xl font-bold">{advisorCount}</p>
          </CardContent>
        </Card>
      </div>

      {activeFailures.length ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Échecs Edge Function sans succès plus récent
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {activeFailures.slice(0, 12).map((failure, index) => (
              <div
                key={`${String(failure.function_name)}-${String(
                  failure.action,
                )}-${index}`}
                className="rounded-2xl border p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">
                    {String(failure.function_name || "fonction")}
                  </Badge>
                  <Badge variant="outline">
                    {String(failure.action || "action")}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {String(failure.last_error || "Erreur non renseignée")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {String(failure.failure_count || 0)} échec(s) ·{" "}
                  {formatDate(String(failure.last_failure_at || ""))}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm">
              Aucun échec Edge Function actuel dans la fenêtre observée.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>File d’incidents</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => overviewQuery.refetch()}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCcw
                className={`h-4 w-4 ${
                  overviewQuery.isFetching ? "animate-spin" : ""
                }`}
              />
            </Button>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
            {overviewQuery.isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun incident actif.
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
                    {severityBadge(incident.severity)}
                    {incidentStatusBadge(incident.status)}
                    <Badge variant="outline">
                      ×{incident.occurrence_count}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 font-semibold">
                    {incident.title}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(incident.last_seen_at)}
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
                        {selectedIncident.source} ·{" "}
                        {selectedIncident.id.slice(0, 8).toUpperCase()}
                      </p>
                      <CardTitle className="mt-2">
                        {selectedIncident.title}
                      </CardTitle>
                    </div>
                    <div className="flex gap-2">
                      {severityBadge(selectedIncident.severity)}
                      {incidentStatusBadge(selectedIncident.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedIncident.summary}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Première occurrence
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatDate(selectedIncident.first_seen_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Dernière occurrence
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatDate(selectedIncident.last_seen_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs text-muted-foreground">
                        Occurrences
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {selectedIncident.occurrence_count}
                      </p>
                    </div>
                  </div>

                  {selectedIncident.github_pr_url ? (
                    <Button asChild variant="outline">
                      <a
                        href={selectedIncident.github_pr_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Ouvrir la PR #{selectedIncident.github_pr_number}
                      </a>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Analyse fondée sur les preuves</CardTitle>
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
                      <Bot className="mr-2 h-4 w-4" />
                    )}
                    Analyser l’incident
                  </Button>
                </CardContent>
              </Card>

              {selectedAssessment ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle>Dernière évaluation Guardian</CardTitle>
                      <div className="flex gap-2">
                        {severityBadge(selectedAssessment.severity)}
                        <Badge variant="outline">
                          Risque {selectedAssessment.risk_level}
                        </Badge>
                        <Badge variant="secondary">
                          {selectedAssessment.confidence === null
                            ? "Confiance —"
                            : `Confiance ${Math.round(
                                selectedAssessment.confidence * 100,
                              )} %`}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {String(assessmentPayload.summary || "")}
                    </p>

                    <div className="rounded-2xl border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Cause probable
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {String(
                          assessmentPayload.probable_cause ||
                            "Non déterminée.",
                        )}
                      </p>
                    </div>

                    {alternatives.length ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/20">
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          Causes alternatives
                        </div>
                        <ul className="space-y-1 text-sm">
                          {alternatives.map((entry) => (
                            <li key={entry}>• {entry}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {evidence.length ? (
                      <div>
                        <h3 className="mb-3 font-semibold">Preuves</h3>
                        <div className="space-y-2">
                          {evidence.map((entry, index) => (
                            <div
                              key={`${String(entry.source)}-${index}`}
                              className="rounded-2xl border p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                  {String(entry.source || "source")}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  confiance{" "}
                                  {Math.round(
                                    Number(entry.confidence || 0) * 100,
                                  )}
                                  %
                                </span>
                              </div>
                              <p className="mt-2 text-sm">
                                {String(entry.fact || "")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {repairPlan.length ? (
                      <div>
                        <h3 className="mb-3 flex items-center gap-2 font-semibold">
                          <Wrench className="h-4 w-4" />
                          Plan de réparation
                        </h3>
                        <div className="space-y-3">
                          {repairPlan.map((step, index) => (
                            <div
                              key={`${String(step.step)}-${index}`}
                              className="rounded-2xl border p-4"
                            >
                              <p className="font-semibold">
                                {index + 1}. {String(step.step || "")}
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {String(step.reason || "")}
                              </p>
                              {stringArray(step.files).length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {stringArray(step.files).map((file) => (
                                    <Badge key={file} variant="outline">
                                      {file}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              <p className="mt-3 text-xs text-muted-foreground">
                                Rollback : {String(step.rollback || "—")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border p-4">
                        <p className="font-semibold">Tests requis</p>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {tests.map((test) => (
                            <li key={test}>• {test}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <p className="font-semibold">
                          Conditions de validation
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {validationConditions.map((condition) => (
                            <li key={condition}>• {condition}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm dark:bg-blue-950/20">
                      <div className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                        Une approbation humaine est obligatoire. Guardian ne
                        modifie jamais directement `main` ni la production.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Vérification post-correction</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="guardian-function-name">
                      Edge Function concernée
                    </Label>
                    <Input
                      id="guardian-function-name"
                      value={functionName}
                      onChange={(event) => setFunctionName(event.target.value)}
                      placeholder="Ex. google-actions-center-sync"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <SearchCheck className="mr-2 h-4 w-4" />
                    )}
                    Vérifier le retour à la normale
                  </Button>

                  {selectedVerification ? (
                    <div className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Activity className="h-4 w-4" />
                        <p className="font-semibold">
                          Dernière vérification
                        </p>
                        <Badge
                          variant={
                            selectedVerification.status === "healthy"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {selectedVerification.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <p className="text-sm text-muted-foreground">
                          Succès :{" "}
                          {String(verificationChecks.success_count || 0)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Échecs :{" "}
                          {String(verificationChecks.failure_count || 0)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Dernier succès :{" "}
                          {formatDate(
                            String(
                              verificationChecks.last_success_at || "",
                            ),
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Dernier échec :{" "}
                          {formatDate(
                            String(
                              verificationChecks.last_failure_at || "",
                            ),
                          )}
                        </p>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Résolution automatique : non. La décision finale reste
                        dans la file d’incidents existante.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
