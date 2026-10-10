import { normalizeMarketingDestination, validateMarketingWindow, type MarketingCampaignPurpose } from "../../../../supabase/functions/_shared/marketing-campaign-validation";
import type { MarketingStrategy } from "../../../../supabase/functions/_shared/marketing-ai-plan";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";

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

type CampaignPreview = {
  title: string;
  channel: MarketingChannelId;
  scheduled_at: string;
  content: { headline: string; body: string; call_to_action: string; cta_url?: string; hashtags?: string[]; visual_url?: string | null; visual_prompt?: string | null };
};

type GenerateResult = {
  previews?: CampaignPreview[];
  strategy?: MarketingStrategy | null;
  warnings?: string[];
  audienceEstimate?: { channels: Array<{ channel: string; deliveryMode: string; eligibleContacts: number | null }> } | null;
  campaign: { id: string; name: string } | null;
  items: Array<{ id: string; title: string; channel: MarketingChannelId; scheduled_at: string }>;
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
  const [audienceHint, setAudienceHint] = useState("");
  const [channels, setChannels] = useState<MarketingChannelId[]>(["facebook", "instagram"]);
  const [purpose, setPurpose] = useState<MarketingCampaignPurpose>("awareness");
  const [destinationUrl, setDestinationUrl] = useState("https://www.thetok.ch/contact");
  const [startsAt, setStartsAt] = useState(isoDay(1));
  const [endsAt, setEndsAt] = useState(isoDay(15));
  const [itemCount, setItemCount] = useState(4);
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

  const applyGenevaBrief = () => {
    setPurpose("acquisition");
    setChannels(["facebook", "instagram"]);
    setObjective("Recruter des restaurateurs genevois. Présenter la commission TOK de 5 CHF par table réellement servie, quel que soit le nombre de convives, en précisant que l'abonnement est distinct. Comparer ce modèle aux plateformes qui facturent par couvert, sans généraliser à tous les concurrents ni inventer leurs tarifs. Construire une progression : problème de coût, comparaison, objections, demande de démonstration. Ne pas promettre d'économies universelles.");
    setAudienceHint("Restaurateurs prospects du canton de Genève (GE), audience_kind=restaurant et contact_type=restaurant_prospect pour toute la campagne.");
    setDestinationUrl("https://www.thetok.ch/restaurateurs/alternative-commission-couvert");
    setStartsAt(isoDay(1));
    setEndsAt(isoDay(15));
    setItemCount(4);
    setResult(null);
    setError(null);
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

    const startIso = marketingZurichLocalDateTimeToIso(`${startsAt}T09:00:00`);
    const endIso = marketingZurichLocalDateTimeToIso(`${endsAt}T18:00:00`);
    if (!startIso || !endIso) {
      setError("La période contient une heure inexistante ou ambiguë en Europe/Zurich.");
      return;
    }

    try { validateMarketingWindow(startIso, endIso); }
    catch { setError("La date de début doit être future, avec au moins cinq minutes pour préparer la campagne."); return; }
    let approvedDestination: string;
    try { approvedDestination = normalizeMarketingDestination(destinationUrl); }
    catch { setError("Choisissez une page publique TOK proposée dans la liste des destinations, sans paramètres ni identifiants."); return; }
    if (!Number.isInteger(itemCount) || itemCount < channels.length || itemCount > 12) {
      setError("Prévoyez au moins un élément par canal, et au maximum douze éléments."); return;
    }
    if (purpose === "acquisition" && channels.some((channel) => channel === "in_app" || channel === "push")) {
      setError("Les notifications internes ne permettent pas de recruter des restaurateurs sans compte TOK. Choisissez un canal externe."); return;
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
          startsAt: startIso,
          endsAt: endIso,
          itemCount,
          destinationUrl: approvedDestination,
          purpose,
        },
      });
      if (!Array.isArray(response.items)) throw new Error("Invalid campaign response");
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
          <Button type="button" variant="outline" disabled={pending} onClick={applyGenevaBrief}>
            Recruter des restaurateurs genevois
          </Button>
          <div className="space-y-2">
            <Label htmlFor="agent-purpose">Type de campagne</Label>
            <select id="agent-purpose" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={purpose} disabled={pending} onChange={(event) => setPurpose(event.target.value as MarketingCampaignPurpose)}>
              <option value="awareness">Notoriété et information</option>
              <option value="acquisition">Acquisition de nouveaux restaurateurs</option>
              <option value="retention">Relance de contacts déjà joignables</option>
            </select>
          </div>
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
            <Label htmlFor="agent-destination">Page de destination</Label>
            <Input id="agent-destination" type="url" list="agent-destinations" maxLength={200} value={destinationUrl} disabled={pending} onChange={(event) => setDestinationUrl(event.target.value)} />
            <datalist id="agent-destinations">
              <option value="https://www.thetok.ch/contact">Contact et démonstration</option>
              <option value="https://www.thetok.ch/restaurateurs/alternative-commission-couvert">Comparer les commissions</option>
              <option value="https://www.thetok.ch/restaurateurs/geneve">Solution pour les restaurateurs genevois</option>
              <option value="https://www.thetok.ch/packs-restaurateur">Abonnements et conditions</option>
            </datalist>
            <p className="text-xs text-slate-500">Ce lien sera ajouté aux appels à l'action. Sur Instagram, il faut aussi prévoir un lien de profil adapté ; une légende ne crée pas un bouton cliquable.</p>
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
            <p className="text-xs leading-relaxed text-slate-500">
              Facebook et Instagram : publications organiques. Choisir Genève décrit l'audience souhaitée, mais ne crée ni ciblage publicitaire Meta ni budget. Les notifications internes ne touchent que les utilisateurs déjà joignables dans TOK.
            </p>
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
                min={isoDay(0)}
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
                min={startsAt}
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
              · coût du texte uniquement : {formatChf(result.estimatedCostChf)} (hors images et diffusion)
            </p>
            {result.strategy ? (
              <div className="space-y-2 rounded-lg border p-4 text-sm">
                <h3 className="font-semibold">Stratégie proposée</h3>
                <p>{result.strategy.sequence}</p>
                <p><strong>Conversion à mesurer : </strong>{result.strategy.conversion_goal}</p>
                <p><strong>Mesure : </strong>{result.strategy.measurement_plan}</p>
                {result.strategy.assumptions.map((assumption, index) => <p key={index} className="text-amber-800">À vérifier : {assumption}</p>)}
              </div>
            ) : null}
            {result.warnings?.length ? (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Points à vérifier avant approbation</AlertTitle>
                <AlertDescription className="space-y-2">{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-xs text-slate-500">Budget publicitaire non défini. Portée organique non estimée. Un brouillon généré n'est pas une preuve de diffusion ou de conversion.</p>
            {result.audienceEstimate?.channels.map((estimate) => (
              <p key={estimate.channel} className="text-xs text-slate-600">
                {estimate.channel} : {estimate.deliveryMode === "public" ? "portée publique non estimée" : estimate.eligibleContacts === null ? "contacts éligibles non estimés" : estimate.eligibleContacts + " contact(s) actuellement éligible(s), à revérifier avant envoi"}
              </p>
            ))}
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
            {result.previews?.map((preview, index) => (
              <article key={index} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <MarketingChannelBadge channel={preview.channel} />
                <h3 className="font-semibold">{preview.content.headline}</h3>
                <p className="whitespace-pre-wrap text-sm">{preview.content.body}</p>
                <p className="whitespace-pre-wrap text-sm font-medium">{preview.content.call_to_action}</p>
                <p className="text-xs text-slate-500">{preview.content.hashtags?.join(" ")}</p>
                {preview.content.cta_url ? <a href={preview.content.cta_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline">Ouvrir la page de destination</a> : null}
                {preview.content.visual_url ? <img src={preview.content.visual_url} alt={preview.content.headline} loading="lazy" className="max-h-80 rounded-lg object-contain" /> : <p className="text-xs text-amber-800">Aucun visuel attaché à ce brouillon.</p>}
                {preview.content.visual_prompt ? <details className="text-xs text-slate-600"><summary>Brief du visuel</summary><p className="mt-2 whitespace-pre-wrap">{preview.content.visual_prompt}</p></details> : null}
              </article>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onNavigate("calendar")}>
                Relire et approuver les éléments
              </Button>
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
                    {formatChf(run.estimated_cost_chf)} (texte uniquement, hors images)
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
