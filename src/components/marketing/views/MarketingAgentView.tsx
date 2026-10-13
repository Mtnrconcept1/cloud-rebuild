import { MarketingBrandReferences } from "@/components/marketing/MarketingBrandReferences";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import {
  MarketingChannelBadge,
  MARKETING_CHANNEL_LABELS,
  MarketingEmptyState,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_MARKETING_FORMATS,
  MARKETING_CAMPAIGN_FREQUENCIES,
  MARKETING_CAMPAIGN_TEMPLATES,
  MARKETING_POST_FORMATS,
  VISUAL_MARKETING_CHANNELS,
  buildCampaignObjective,
  campaignEndDate,
  type MarketingCampaignFrequency,
  type MarketingCampaignTemplateId,
  type MarketingPostFormat,
} from "@/marketing/campaignTemplates";
import {
  MARKETING_BFF_ENDPOINTS,
  MarketingBffError,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";
import type { MarketingChannelId, MarketingSnapshot, MarketingView } from "@/marketing/types";
import {
  marketingZurichDateKey,
  marketingZurichLocalDateTimeToIso,
} from "@/marketing/zurichTime";

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
  items: Array<{
    id: string;
    title: string;
    channel: MarketingChannelId;
    scheduled_at: string;
    content?: { visual_url?: string | null; format?: MarketingPostFormat | null };
  }>;
  summary: string;
  assetCount: number;
  estimatedCostChf: number;
};

function isoDay(offsetDays: number) {
  const current = marketingZurichDateKey(new Date());
  const [year, month, day] = current.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
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
  const [templateIds, setTemplateIds] = useState<MarketingCampaignTemplateId[]>(["zero_wait"]);
  const [audienceHint, setAudienceHint] = useState("");
  const [channels, setChannels] = useState<MarketingChannelId[]>(["in_app"]);
  const [startsAt, setStartsAt] = useState(isoDay(1));
  const [itemCount, setItemCount] = useState(4);
  const [frequency, setFrequency] = useState<MarketingCampaignFrequency>("twice_weekly");
  const [formats, setFormats] = useState<Partial<Record<MarketingChannelId, MarketingPostFormat>>>(DEFAULT_MARKETING_FORMATS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
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
  const endsAt = useMemo(
    () => campaignEndDate(startsAt, itemCount, frequency),
    [frequency, itemCount, startsAt],
  );
  const generatedObjective = useMemo(
    () => buildCampaignObjective(templateIds, objective),
    [objective, templateIds],
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

  const toggleTemplate = (templateId: MarketingCampaignTemplateId) => {
    setTemplateIds((current) => current.includes(templateId)
      ? current.filter((entry) => entry !== templateId)
      : [...current, templateId]);
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!templateIds.length && !objective.trim()) {
      setError("Sélectionnez au moins un modèle ou précisez votre objectif.");
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

    const startIso = marketingZurichLocalDateTimeToIso(`${startsAt}T09:00:00`);
    const endIso = marketingZurichLocalDateTimeToIso(`${endsAt}T18:00:00`);
    if (!startIso || !endIso) {
      setError("La période contient une heure inexistante ou ambiguë en Europe/Zurich.");
      return;
    }

    setPending(true);
    try {
      const response = await marketingBffRequest<GenerateResult>(MARKETING_BFF_ENDPOINTS.agent, {
        method: "POST",
        timeoutMs: AGENT_TIMEOUT_MS,
        body: {
          action: "generate",
          objective: generatedObjective.slice(0, 2000),
          audienceHint: audienceHint.trim(),
          channels,
          formats: Object.fromEntries(
            channels
              .filter((channel) => VISUAL_MARKETING_CHANNELS.includes(channel) && formats[channel])
              .map((channel) => [channel, formats[channel]]),
          ),
          startsAt: startIso,
          endsAt: endIso,
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

      <MarketingBrandReferences />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" aria-hidden />
            Brief de campagne
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">1. Choisissez un ou plusieurs modèles</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MARKETING_CAMPAIGN_TEMPLATES.map((template) => {
                const selected = templateIds.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => toggleTemplate(template.id)}
                    className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${selected ? "border-orange-500 bg-orange-50 text-orange-950" : "border-slate-200 bg-white hover:border-slate-400"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300"}`} aria-hidden>
                        {selected ? "✓" : ""}
                      </span>
                      {template.label}
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-slate-600">{template.summary}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="agent-objective">Précision ou objectif personnalisé (facultatif)</Label>
            <Textarea
              id="agent-objective"
              rows={3}
              maxLength={700}
              value={objective}
              disabled={pending}
              placeholder="Ex. : mettre en avant les tables disponibles ce vendredi à Genève."
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
            <Label>2. Où publier ?</Label>
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
                    {MARKETING_CHANNEL_LABELS[channel]}
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

          {channels.some((channel) => VISUAL_MARKETING_CHANNELS.includes(channel)) ? (
            <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
              <div>
                <p className="text-sm font-medium">3. Format du visuel par réseau</p>
                <p className="mt-1 text-xs text-slate-500">Chaque brouillon conserve le cadrage choisi pour sa relecture.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {channels.filter((channel) => VISUAL_MARKETING_CHANNELS.includes(channel)).map((channel) => (
                  <div key={channel} className="space-y-2">
                    <Label htmlFor={`agent-format-${channel}`}>{MARKETING_CHANNEL_LABELS[channel]}</Label>
                    <Select
                      value={formats[channel] || DEFAULT_MARKETING_FORMATS[channel] || "1:1"}
                      onValueChange={(format) => setFormats((current) => ({ ...current, [channel]: format as MarketingPostFormat }))}
                    >
                      <SelectTrigger id={`agent-format-${channel}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MARKETING_POST_FORMATS.map((format) => <SelectItem key={format} value={format}>{format}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
              <Label htmlFor="agent-frequency">Fréquence</Label>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as MarketingCampaignFrequency)} disabled={pending}>
                <SelectTrigger id="agent-frequency"><SelectValue /></SelectTrigger>
                <SelectContent>{MARKETING_CAMPAIGN_FREQUENCIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
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
                onChange={(event) => setItemCount(Math.min(12, Math.max(1, Number(event.target.value) || 1)))}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Calendrier calculé automatiquement du {startsAt} au {endsAt}, en heure suisse.</p>

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
                Générer ma campagne
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
            {result.items.some((item) => item.content?.visual_url) ? (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-900">Visuels générés à approuver</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {result.items.filter((item) => item.content?.visual_url).map((item) => (
                    <figure key={`visual-${item.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img
                        src={item.content?.visual_url || ""}
                        alt={`Visuel généré pour ${item.title}`}
                        className="w-full object-cover"
                        style={{ aspectRatio: (item.content?.format || "1:1").replace(":", " / ") }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <figcaption className="space-y-1 p-3">
                        <p className="truncate text-xs font-semibold">{item.title}</p>
                        <p className="text-[11px] text-slate-500">{MARKETING_CHANNEL_LABELS[item.channel]} · {item.content?.format || "1:1"} · à approuver</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onNavigate("campaigns")}>
                Voir la campagne et ses visuels
              </Button>
              <Button type="button" variant="outline" onClick={() => onNavigate("calendar")}>Relire et approuver les éléments</Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              La génération ne donne aucune autorisation de diffusion. Chaque élément doit être
              relu puis approuvé séparément dans le calendrier ; les canaux non confirmés restent
              bloqués et la pause globale conserve toujours la priorité.
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
