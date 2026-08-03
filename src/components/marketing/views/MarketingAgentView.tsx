import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MARKETING_BFF_ENDPOINTS,
  MarketingBffError,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";
import type { MarketingChannelId, MarketingSnapshot, MarketingView } from "@/marketing/types";

/** Channels an operator can reasonably ask the agent to plan for. */
const PROPOSABLE_CHANNELS: MarketingChannelId[] = [
  "in_app",
  "email",
  "tok_news",
  "instagram",
  "facebook",
  "linkedin",
  "manual_call",
  "manual_email",
];

const AGENT_TIMEOUT_MS = 125_000;

type AgentRun = {
  id: string;
  status: "running" | "succeeded" | "failed";
  objective: string;
  requested_channels: string[];
  campaign_id: string | null;
  campaign_name: string | null;
  item_count: number;
  asset_count: number;
  model: string;
  estimated_cost_chf: number | string;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
};

type GenerateResult = {
  campaign: { id: string; name: string } | null;
  items: Array<{ id: string; title: string; channel: MarketingChannelId; scheduled_at: string }>;
  summary: string;
  assetCount: number;
  estimatedCostChf: number;
};

function isoDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(9, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function formatChf(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toFixed(2)} CHF`;
}

export default function MarketingAgentView({
  snapshot,
  canMutateBackend,
  onNavigate,
}: {
  snapshot: MarketingSnapshot;
  canMutateBackend: boolean;
  onNavigate: (view: MarketingView) => void;
}) {
  const [objective, setObjective] = useState("");
  const [audienceHint, setAudienceHint] = useState("");
  const [channels, setChannels] = useState<MarketingChannelId[]>(["in_app"]);
  const [startsAt, setStartsAt] = useState(isoDay(1));
  const [endsAt, setEndsAt] = useState(isoDay(15));
  const [itemCount, setItemCount] = useState(4);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  const launch = async () => {
    if (!result?.campaign?.id) return;
    setLaunching(true);
    setLaunchNotice(null);
    setError(null);
    try {
      const response = await marketingBffRequest<{
        approvedCount: number;
        rejectedCount: number;
        dispatched: boolean;
      }>(MARKETING_BFF_ENDPOINTS.launch, {
        method: "POST",
        timeoutMs: 60_000,
        body: { campaignId: result.campaign.id, itemIds: result.items.map((item) => item.id) },
      });
      setLaunchNotice(
        `${response.approvedCount} élément(s) approuvé(s)` +
          (response.rejectedCount > 0 ? `, ${response.rejectedCount} refusé(s)` : "") +
          (response.dispatched
            ? ". L'envoi a démarré et suit la cadence automatique."
            : ". L'envoi démarrera à la prochaine exécution planifiée."),
      );
    } catch (caught) {
      setError(
        caught instanceof MarketingBffError ? caught.message : "Le lancement a échoué.",
      );
    } finally {
      setLaunching(false);
    }
  };

  const connectedChannels = useMemo(
    () =>
      new Set(
        snapshot.integrations
          // The snapshot exposes a connected provider as "available".
          .filter((integration) => integration.status === "available")
          .map((integration) => integration.channel),
      ),
    [snapshot.integrations],
  );

  const loadRuns = useCallback(async () => {
    try {
      const response = await marketingBffRequest<{ runs?: AgentRun[] }>(
        MARKETING_BFF_ENDPOINTS.agent,
        { method: "POST", body: { action: "list_runs" } },
      );
      setRuns(Array.isArray(response.runs) ? response.runs : []);
    } catch {
      // The history is informational; a failure here must not hide the form.
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const toggleChannel = (channel: MarketingChannelId) => {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((entry) => entry !== channel)
        : current.length >= 8
          ? current
          : [...current, channel],
    );
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!objective.trim()) {
      setError("Décrivez l'objectif de la campagne.");
      return;
    }
    if (channels.length === 0) {
      setError("Sélectionnez au moins un canal.");
      return;
    }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("La date de fin doit suivre la date de début.");
      return;
    }

    setPending(true);
    try {
      const response = await marketingBffRequest<GenerateResult>(MARKETING_BFF_ENDPOINTS.agent, {
        method: "POST",
        timeoutMs: AGENT_TIMEOUT_MS,
        body: {
          action: "generate",
          objective: objective.trim(),
          audienceHint: audienceHint.trim(),
          channels,
          startsAt: new Date(`${startsAt}T09:00:00`).toISOString(),
          endsAt: new Date(`${endsAt}T18:00:00`).toISOString(),
          itemCount,
        },
      });
      setResult(response);
      void loadRuns();
    } catch (caught) {
      setError(
        caught instanceof MarketingBffError
          ? caught.message
          : "L'agent n'a pas pu produire de plan.",
      );
    } finally {
      setPending(false);
    }
  };

  const unconnectedSelected = channels.filter((channel) => !connectedChannels.has(channel));

  return (
    <div className="space-y-6">
      <Alert className="border-sky-200 bg-sky-50 text-sky-900">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Tout arrive en brouillon</AlertTitle>
        <AlertDescription>
          L'agent rédige la campagne, le calendrier, les textes et les visuels, puis les dépose en
          brouillon. Rien n'est envoyé à un contact réel tant qu'un administrateur n'a pas approuvé
          chaque élément.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" aria-hidden />
            Brief de campagne
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="agent-objective">Objectif</Label>
            <Textarea
              id="agent-objective"
              rows={3}
              maxLength={2000}
              value={objective}
              disabled={pending}
              placeholder="Ex. : recruter des restaurants indépendants à Genève et Lausanne avant la rentrée."
              onChange={(event) => setObjective(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-audience">Audience visée (facultatif)</Label>
            <Input
              id="agent-audience"
              maxLength={500}
              value={audienceHint}
              disabled={pending}
              placeholder="Ex. : restaurateurs, canton de Genève"
              onChange={(event) => setAudienceHint(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Canaux</Label>
            <div className="flex flex-wrap gap-2">
              {PROPOSABLE_CHANNELS.map((channel) => {
                const selected = channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    disabled={pending}
                    onClick={() => toggleChannel(channel)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {channel}
                    {!connectedChannels.has(channel) ? " ·  non connecté" : ""}
                  </button>
                );
              })}
            </div>
            {unconnectedSelected.length > 0 ? (
              <p className="text-xs leading-relaxed text-amber-700">
                {unconnectedSelected.join(", ")} n'{unconnectedSelected.length > 1 ? "ont" : "a"} pas
                d'intégration connectée. L'agent peut planifier ces éléments, mais ils resteront
                bloqués à l'envoi tant que le fournisseur n'est pas configuré.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => onNavigate("integrations")}
                >
                  Voir les intégrations
                </button>
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="agent-start">Début</Label>
              <Input
                id="agent-start"
                type="date"
                value={startsAt}
                disabled={pending}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-end">Fin</Label>
              <Input
                id="agent-end"
                type="date"
                value={endsAt}
                disabled={pending}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-count">Nombre d'éléments</Label>
              <Input
                id="agent-count"
                type="number"
                min={1}
                max={12}
                value={itemCount}
                disabled={pending}
                onChange={(event) => setItemCount(Number(event.target.value) || 1)}
              />
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="button" onClick={submit} disabled={pending || !canMutateBackend}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Génération en cours…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Générer la campagne
              </>
            )}
          </Button>
          {!canMutateBackend ? (
            <p className="text-xs text-slate-500">
              Les écritures sont indisponibles : le centre marketing est en lecture seule.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {result.campaign?.name || "Campagne générée"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">{result.summary}</p>
            ) : null}
            <p className="text-xs text-slate-500">
              {result.items.length} élément(s) en brouillon · {result.assetCount} visuel(s) généré(s)
              · coût estimé {formatChf(result.estimatedCostChf)}
            </p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {result.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <MarketingChannelBadge channel={item.channel} />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                  <span className="text-xs text-slate-500">
                    {formatMarketingDate(item.scheduled_at)}
                  </span>
                </li>
              ))}
            </ul>
            {launchNotice ? (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{launchNotice}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={launch} disabled={launching || !canMutateBackend}>
                {launching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Lancement…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    Approuver et lancer la campagne
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => onNavigate("calendar")}>
                Relire d'abord dans le calendrier
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Le lancement approuve la campagne et ses éléments, puis confie l'envoi à
              l'orchestrateur. La cadence est gérée automatiquement : montée en charge
              progressive, étalement sur la journée et par fournisseur de messagerie, arrêt
              automatique si les rebonds ou les plaintes montent.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Générations précédentes</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <MarketingEmptyState
              title="Aucune génération"
              description="Les campagnes produites par l'agent apparaîtront ici avec leur coût."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {runs.map((run) => (
                <li key={run.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        run.status === "succeeded"
                          ? "bg-emerald-100 text-emerald-800"
                          : run.status === "failed"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {run.status === "succeeded"
                        ? "Réussie"
                        : run.status === "failed"
                          ? "Échouée"
                          : "En cours"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {run.campaign_name || run.objective || "Sans objectif"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatMarketingDate(run.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {run.item_count} élément(s) · {run.asset_count} visuel(s) ·{" "}
                    {formatChf(run.estimated_cost_chf)}
                    {run.model ? ` · ${run.model}` : ""}
                  </p>
                  {run.last_error ? (
                    <p className="text-xs text-rose-700">{run.last_error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
