import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { saveRestaurantCampaign } from "@/lib/campaigns";
import {
  approveCampaignStudioRun,
  generateCampaignStudioPlan,
  listCampaignStudioRuns,
  markCampaignStudioRunLaunched,
  type CampaignStudioGuardrails,
  type CampaignStudioRun,
} from "@/lib/tokIntelligence";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const DEFAULT_GUARDRAILS: CampaignStudioGuardrails = {
  max_budget_chf: 120,
  max_daily_budget_chf: 30,
  max_discount_percent: 15,
  max_conversions: 30,
  stop_cost_per_conversion_chf: 15,
  manual_approval_required: true,
};

function formatMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(2)} CHF` : "—";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusBadge(status: CampaignStudioRun["status"]) {
  const labels: Record<CampaignStudioRun["status"], string> = {
    draft: "Brouillon",
    approved: "Approuvé",
    launched: "Lancé",
    paused: "En pause",
    stopped: "Arrêté",
    failed: "Échec",
  };
  return <Badge variant={status === "failed" ? "destructive" : status === "launched" ? "default" : "secondary"}>{labels[status]}</Badge>;
}

export default function DashboardCampaignStudio() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState(
    "Remplir un créneau faible avec une campagne rentable, sans dégrader l'image du restaurant.",
  );
  const [guardrails, setGuardrails] = useState<CampaignStudioGuardrails>(
    DEFAULT_GUARDRAILS,
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activateNow, setActivateNow] = useState(false);
  const [activationConfirmed, setActivationConfirmed] = useState(false);

  const runsQuery = useQuery({
    queryKey: ["campaign-studio-runs", selectedId],
    queryFn: () => listCampaignStudioRuns(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 15_000,
  });

  const runs = runsQuery.data?.runs || [];
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId],
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Sélectionnez un restaurant.");
      return generateCampaignStudioPlan({
        restaurantId: selectedId,
        prompt,
        guardrails,
        idempotencyKey: `campaign-studio:${selectedId}:${crypto.randomUUID()}`,
      });
    },
    onSuccess: async ({ run }) => {
      setSelectedRunId(run.id);
      await queryClient.invalidateQueries({
        queryKey: ["campaign-studio-runs", selectedId],
      });
      toast({
        title: "Plan Campaign Studio créé",
        description:
          "Le plan reste un brouillon. Aucune campagne n'a été publiée.",
      });
    },
    onError: (error) => {
      toast({
        title: "Création impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const materializeMutation = useMutation({
    mutationFn: async ({
      run,
      active,
    }: {
      run: CampaignStudioRun;
      active: boolean;
    }) => {
      if (!selectedId) throw new Error("Sélectionnez un restaurant.");
      if (active && !activationConfirmed) {
        throw new Error("Confirmez explicitement le lancement.");
      }

      const approved = await approveCampaignStudioRun({
        restaurantId: selectedId,
        runId: run.id,
        guardrails: run.guardrails,
      });
      const plan = approved.run.plan;
      const payload = plan.campaign_payload;
      const { data: campaign, error } = await saveRestaurantCampaign(
        selectedId,
        {
          title: payload.title,
          body: payload.body,
          type: payload.type,
          target_pages: payload.target_pages,
          pricing_strategy: payload.pricing_strategy,
          base_budget: payload.base_budget,
          budget_daily: payload.budget_daily,
          starts_at: payload.starts_at,
          ends_at: payload.ends_at,
          target_criteria: payload.target_criteria,
          channels: payload.channels,
          payment_method: "credits",
          status: active ? "active" : "draft",
        },
      );
      if (error) throw error;
      if (!campaign?.id) {
        throw new Error("La campagne n'a pas pu être enregistrée.");
      }

      await markCampaignStudioRunLaunched({
        restaurantId: selectedId,
        runId: run.id,
        campaignId: campaign.id,
      });

      return { campaign, active };
    },
    onSuccess: async ({ active }) => {
      setActivationConfirmed(false);
      setActivateNow(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["campaign-studio-runs", selectedId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard-campaigns", selectedId],
        }),
      ]);
      toast({
        title: active ? "Campagne lancée" : "Brouillon transféré",
        description: active
          ? "La campagne respecte les garde-fous validés et peut être suivie dans Campagnes."
          : "La campagne a été créée en brouillon dans le moteur TOK.",
      });
    },
    onError: (error) => {
      toast({
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const updateNumber = (
    key: keyof CampaignStudioGuardrails,
    value: string,
  ) => {
    const numberValue = Number(value);
    setGuardrails((current) => ({
      ...current,
      [key]: Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0,
    }));
  };

  return (
    <DashboardLayout contentWidth="full">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border bg-gradient-to-br from-orange-50 via-background to-amber-50 p-6 shadow-sm dark:from-orange-950/25 dark:to-amber-950/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                TOK Campaign Studio
              </div>
              <h1 className="font-display text-3xl font-bold">
                Transformer un objectif commercial en campagne contrôlée
              </h1>
              <p className="mt-3 text-muted-foreground">
                L’IA analyse les données du restaurant et prépare un plan. Le
                moteur publicitaire TOK reste seul responsable de la
                facturation, du ciblage et du lancement.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/dashboard/campagnes">
                <Megaphone className="mr-2 h-4 w-4" />
                Ouvrir les campagnes
              </Link>
            </Button>
          </div>
        </div>

        {!selectedId ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Sélectionnez un restaurant dans le menu du dashboard.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Brief pour {selectedRestaurant?.name || "le restaurant"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="campaign-studio-prompt">
                      Objectif et contraintes
                    </Label>
                    <Textarea
                      id="campaign-studio-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      rows={6}
                      maxLength={4000}
                      placeholder="Ex. Remplir le brunch de dimanche avec un budget de 120 CHF…"
                    />
                    <p className="text-xs text-muted-foreground">
                      {prompt.length}/4000 caractères
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="campaign-budget">Budget total maximal</Label>
                      <Input
                        id="campaign-budget"
                        type="number"
                        min={0}
                        max={5000}
                        step={5}
                        value={guardrails.max_budget_chf}
                        onChange={(event) =>
                          updateNumber("max_budget_chf", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaign-daily-budget">
                        Budget quotidien maximal
                      </Label>
                      <Input
                        id="campaign-daily-budget"
                        type="number"
                        min={0}
                        max={1000}
                        step={5}
                        value={guardrails.max_daily_budget_chf}
                        onChange={(event) =>
                          updateNumber(
                            "max_daily_budget_chf",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaign-conversions">
                        Conversions maximales
                      </Label>
                      <Input
                        id="campaign-conversions"
                        type="number"
                        min={1}
                        max={10000}
                        value={guardrails.max_conversions}
                        onChange={(event) =>
                          updateNumber("max_conversions", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaign-cpa">
                        Arrêt au-delà de ce coût/conversion
                      </Label>
                      <Input
                        id="campaign-cpa"
                        type="number"
                        min={0}
                        max={1000}
                        step={1}
                        value={guardrails.stop_cost_per_conversion_chf}
                        onChange={(event) =>
                          updateNumber(
                            "stop_cost_per_conversion_chf",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="campaign-discount">
                        Réduction maximale autorisée
                      </Label>
                      <Input
                        id="campaign-discount"
                        type="number"
                        min={0}
                        max={70}
                        value={guardrails.max_discount_percent}
                        onChange={(event) =>
                          updateNumber(
                            "max_discount_percent",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border bg-muted/30 p-4">
                    <Checkbox
                      id="campaign-manual-approval"
                      checked={guardrails.manual_approval_required}
                      onCheckedChange={(checked) =>
                        setGuardrails((current) => ({
                          ...current,
                          manual_approval_required: checked !== false,
                        }))
                      }
                    />
                    <div>
                      <Label htmlFor="campaign-manual-approval">
                        Validation humaine obligatoire
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recommandé. Aucun plan IA ne peut contourner le moteur de
                        crédits et les validations serveur.
                      </p>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      !prompt.trim() ||
                      generateMutation.isPending ||
                      guardrails.max_budget_chf <= 0
                    }
                    onClick={() => generateMutation.mutate()}
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Générer le plan contrôlé
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Historique des plans</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => runsQuery.refetch()}
                    disabled={runsQuery.isFetching}
                  >
                    <RefreshCcw
                      className={`h-4 w-4 ${
                        runsQuery.isFetching ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun plan n’a encore été généré.
                    </p>
                  ) : (
                    runs.map((run) => (
                      <button
                        type="button"
                        key={run.id}
                        onClick={() => setSelectedRunId(run.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selectedRun?.id === run.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {run.plan?.title || run.objective || "Plan campagne"}
                          </span>
                          {statusBadge(run.status)}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {run.plan?.summary || run.request_prompt}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDate(run.created_at)}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {selectedRun ? (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>
                          {selectedRun.plan?.title || "Plan Campaign Studio"}
                        </CardTitle>
                        {statusBadge(selectedRun.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <p className="text-sm leading-6 text-muted-foreground">
                        {selectedRun.plan?.summary}
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Budget
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {formatMoney(
                              selectedRun.plan?.campaign_payload?.base_budget,
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Conversions estimées
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {selectedRun.plan?.projected_metrics
                              ?.estimated_conversions ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Portée estimée
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {selectedRun.plan?.projected_metrics
                              ?.estimated_reach ?? 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Coût/conversion estimé
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {formatMoney(
                              selectedRun.plan?.projected_metrics
                                ?.estimated_cost_per_conversion_chf,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <p className="font-semibold">
                          {selectedRun.plan?.campaign_payload?.title}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedRun.plan?.campaign_payload?.body}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(selectedRun.plan?.campaign_payload?.target_pages ||
                            []).map((page) => (
                            <Badge key={page} variant="outline">
                              {page}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {selectedRun.plan?.warnings?.length ? (
                        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                          <div className="mb-2 flex items-center gap-2 font-semibold">
                            <AlertTriangle className="h-4 w-4" />
                            Points à vérifier
                          </div>
                          <ul className="space-y-1 text-sm">
                            {selectedRun.plan.warnings.map((warning) => (
                              <li key={warning}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Validation et transfert</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-3 rounded-2xl border p-4">
                        <Checkbox
                          id="campaign-activate-now"
                          checked={activateNow}
                          onCheckedChange={(checked) => {
                            const enabled = checked === true;
                            setActivateNow(enabled);
                            if (!enabled) setActivationConfirmed(false);
                          }}
                        />
                        <div>
                          <Label htmlFor="campaign-activate-now">
                            Activer immédiatement après création
                          </Label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Sinon, le plan est transféré comme brouillon dans
                            l’outil Campagnes.
                          </p>
                        </div>
                      </div>

                      {activateNow ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:bg-red-950/20">
                          <Checkbox
                            id="campaign-confirm-launch"
                            checked={activationConfirmed}
                            onCheckedChange={(checked) =>
                              setActivationConfirmed(checked === true)
                            }
                          />
                          <div>
                            <Label htmlFor="campaign-confirm-launch">
                              Je confirme le budget, l’audience et le lancement
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Cette confirmation est journalisée. Le budget sera
                              engagé selon le système de crédits TOK.
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <Button
                        className="w-full"
                        disabled={
                          materializeMutation.isPending ||
                          selectedRun.status === "launched" ||
                          (activateNow && !activationConfirmed)
                        }
                        onClick={() =>
                          materializeMutation.mutate({
                            run: selectedRun,
                            active: activateNow,
                          })
                        }
                      >
                        {materializeMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : activateNow ? (
                          <Play className="mr-2 h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {activateNow
                          ? "Valider et lancer"
                          : "Valider et créer le brouillon"}
                      </Button>

                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        L’IA ne débite jamais directement un compte et n’écrit
                        jamais elle-même dans la table des campagnes.
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Générez ou sélectionnez un plan pour afficher sa simulation.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
