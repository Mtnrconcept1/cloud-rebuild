import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketingChannelId, MarketingSnapshot } from "@/marketing/types";
import { marketingZurichDateKey, marketingZurichLocalDateTimeToIso } from "@/marketing/zurichTime";
import { CAMPAIGN_TEMPLATES } from "../../../supabase/functions/_shared/marketing-campaign-templates";

const NETWORKS = [["instagram", "Instagram"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"], ["tok_news", "Actualités TOK"]] as const;
const FORMATS = [["1:1", "Carré"], ["4:5", "Portrait"], ["9:16", "Vertical"], ["16:9", "Paysage"]] as const;
type Format = typeof FORMATS[number][0];
type Cadence = "every_three_hours" | "daily" | "every_other_day" | "twice_weekly" | "weekly" | "biweekly";
export type CampaignGenerationRequest = {
  objective: string;
  audienceHint: string;
  channels: MarketingChannelId[];
  startsAt: string;
  endsAt: string;
  itemCount: number;
  formats?: Partial<Record<MarketingChannelId, Format>>;
  campaignOptions?: {
    templateIds: string[];
    postCount: number;
    cadence: Cadence;
    formatsByChannel: Partial<Record<MarketingChannelId, Format[]>>;
  };
};

export function MarketingCampaignBuilder({ snapshot, pending, disabled, onGenerate }: {
  snapshot: MarketingSnapshot;
  pending: boolean;
  disabled: boolean;
  onGenerate: (request: CampaignGenerationRequest) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<string[]>(["zero_attente"]);
  const [count, setCount] = useState("3");
  const [cadence, setCadence] = useState<Cadence>("every_other_day");
  const [start, setStart] = useState(() => `${marketingZurichDateKey(new Date(Date.now() + 86400000))}T09:00`);
  const [formats, setFormats] = useState<Partial<Record<MarketingChannelId, Format[]>>>({ instagram: ["1:1"], facebook: ["1:1"] });
  const [audience, setAudience] = useState("");
  const [error, setError] = useState("");
  const channels = NETWORKS.map(([id]) => id).filter((id) => formats[id] !== undefined);
  const postCount = Number(count);
  const variants = channels.reduce((sum, channel) => sum + (formats[channel]?.length || 0), 0);
  const distinctFormats = new Set(channels.flatMap((channel) => formats[channel] || [])).size;
  const total = postCount * variants;
  const visuals = postCount * distinctFormats;
  const validCount = Number.isInteger(postCount) && postCount >= 1 && postCount <= 6;
  const limitError = !validCount ? "Choisissez entre 1 et 6 posts par réseau et par format." : visuals > 6 || total > 12
    ? "Ce lot dépasse 6 visuels ou 12 publications. Réduisez le nombre de posts ou de formats pour cette génération." : "";
  const toggleFormat = (channel: MarketingChannelId, format: Format) => setFormats((current) => ({
    ...current, [channel]: current[channel]?.includes(format) ? current[channel]?.filter((entry) => entry !== format) : [...(current[channel] || []), format],
  }));

  const submit = async () => {
    if (pending || disabled) return;
    setError("");
    if (!templates.length) return setError("Sélectionnez au moins un thème.");
    if (!channels.length || channels.some((channel) => !formats[channel]?.length)) return setError("Sélectionnez au moins un réseau et un format pour chaque réseau.");
    if (limitError) return setError(limitError);
    const startsAt = marketingZurichLocalDateTimeToIso(start);
    if (!startsAt || Date.parse(startsAt) <= Date.now()) return setError("Choisissez une date de début future valide (heure de Genève).");
    const lastIndex = postCount - 1;
    const interval = cadence === "daily" ? 1 : cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : 2;
    const lastOffset = cadence === "twice_weekly" ? Math.floor(lastIndex / 2) * 7 + (lastIndex % 2) * 3 : lastIndex * interval;
    const [date, time] = start.split("T");
    const lastDate = new Date(`${date}T12:00:00Z`);
    lastDate.setUTCDate(lastDate.getUTCDate() + lastOffset);
    // Treat the date input as a Swiss wall-clock schedule, never as a UTC recurrence.
    // Conversion rejects skipped/ambiguous local hours at daylight-saving changes.
    const localThreeHourlyEnd = new Date(Date.parse(`${start}:00Z`) + 3 * lastIndex * 3_600_000).toISOString().slice(0, 16);
    const lastIso = marketingZurichLocalDateTimeToIso(cadence === "every_three_hours"
      ? localThreeHourlyEnd
      : `${lastDate.toISOString().slice(0, 10)}T${time}`);
    if (!lastIso) return setError("Le calendrier contient une heure invalide. Choisissez un autre horaire.");
    await onGenerate({
      objective: `Créer une campagne TOK sur les thèmes : ${CAMPAIGN_TEMPLATES.filter(({ id }) => templates.includes(id)).map(({ label }) => label).join(", ")}. Présenter uniquement des avantages vérifiables, sans inventer de promotions, de prix ni de disponibilités.`,
      audienceHint: audience.trim(), channels, startsAt,
      endsAt: new Date(Date.parse(lastIso) + 3600000).toISOString(),
      itemCount: postCount,
      campaignOptions: { templateIds: templates, postCount, cadence, formatsByChannel: Object.fromEntries(channels.map((id) => [id, formats[id]])) },
    });
  };

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5" />Créer une campagne avec des modèles</CardTitle><p className="text-sm text-muted-foreground">Cochez vos critères. TOK prépare les textes, les visuels et le calendrier à relire.</p></CardHeader>
    <CardContent className="space-y-6">
      <fieldset disabled={pending || disabled} className="space-y-6">
        <fieldset><legend className="mb-3 font-medium">1. Quels thèmes souhaitez-vous mettre en avant ?</legend>
          {([['client', 'Côté client'], ['restaurant', 'Côté restaurateur']] as const).map(([audienceKind, groupLabel]) => <fieldset key={audienceKind} className="mb-4"><legend className="mb-2 text-sm text-slate-600">{groupLabel}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CAMPAIGN_TEMPLATES.filter((template) => template.audience === audienceKind).map(({id, label, description}) => <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${templates.includes(id) ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-orange-600" checked={templates.includes(id)} onChange={() => setTemplates((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])} />
            <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-slate-600">{description}</span></span>
          </label>)}</div></fieldset>)}
        </fieldset>
        <fieldset><legend className="mb-3 font-medium">2. Combien de posts et à quel rythme ?</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="builder-count">Posts par réseau et format</Label><Input id="builder-count" type="number" min={1} max={6} step={1} value={count} onChange={(event) => setCount(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="builder-cadence">Fréquence</Label><select id="builder-cadence" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}><option value="every_three_hours">Toutes les 3 heures</option><option value="daily">Tous les jours</option><option value="every_other_day">Tous les 2 jours</option><option value="twice_weekly">2 fois par semaine</option><option value="weekly">Toutes les semaines</option><option value="biweekly">Toutes les 2 semaines</option></select></div>
            <div className="min-w-0 space-y-2"><Label htmlFor="builder-start">Début · heure de Genève</Label><Input id="builder-start" className="min-w-0" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
          </div>
        </fieldset>
        <fieldset><legend className="mb-3 font-medium">3. Quels réseaux et quels formats ?</legend>
          <div className="grid gap-3 sm:grid-cols-2">{NETWORKS.map(([id, label]) => {
            const selected = formats[id] !== undefined;
            const connected = snapshot.integrations.some((integration) => integration.channel === id && integration.status === "available");
            return <div key={id} className={`rounded-xl border p-4 ${selected ? "border-orange-400 bg-orange-50/40" : "border-slate-200"}`}>
              <label className="flex items-center gap-3 font-medium"><input type="checkbox" className="h-4 w-4 accent-orange-600" checked={selected} onChange={() => setFormats((current) => { const next = { ...current }; if (selected) delete next[id]; else next[id] = ["1:1"]; return next; })} />{label}</label>
              {!connected ? <p className="mt-1 text-xs text-amber-800">À connecter avant diffusion ; génération en brouillon possible.</p> : null}
              {selected ? <fieldset className="mt-3"><legend className="sr-only">Formats {label}</legend><div className="flex flex-wrap gap-2">{FORMATS.map(([ratio, name]) => <label key={ratio} className="flex items-center gap-2 rounded-md border bg-white px-2 py-2 text-xs"><input type="checkbox" aria-label={`${label} ${ratio}`} checked={formats[id]?.includes(ratio) || false} onChange={() => toggleFormat(id, ratio)} className="accent-orange-600" />{ratio} · {name}</label>)}</div></fieldset> : null}
              {id === "instagram" && formats[id]?.includes("9:16") ? <p className="mt-2 text-xs text-amber-800">Instagram 9:16 : visuel à exporter pour une Story manuelle. La publication automatique des Stories n’est pas prise en charge.</p> : null}
            </div>;
          })}</div>
          <p className="mt-2 text-xs text-muted-foreground">Visuels fixes. Le format vertical 9:16 ne génère pas une vidéo ou un Reel.</p>
        </fieldset>
        <div className="space-y-2"><Label htmlFor="builder-audience">Audience ou précisions (facultatif)</Label><Input id="builder-audience" maxLength={500} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex. : clients à Genève, ton chaleureux" /></div>
      </fieldset>
      <div className="rounded-xl bg-slate-50 p-4 text-sm" aria-live="polite"><p className="font-semibold">{validCount ? total : 0} publications · {validCount ? visuals : 0} visuels à générer</p><p className="mt-1 text-slate-600">Un même post est décliné sur chaque réseau et chaque format cochés. Pour 8 posts par réseau chaque jour, créez deux lots successifs (6 puis 2), avec leurs visuels distincts. Les réseaux partagent le visuel d’un même post au même format.</p><p className="mt-1 text-xs text-slate-500">Par génération : jusqu’à 6 visuels distincts et 12 publications. Aucune diffusion avant votre approbation.</p></div>
      {error || limitError ? <Alert variant="destructive"><AlertDescription>{error || limitError}</AlertDescription></Alert> : null}
      <Button type="button" onClick={submit} disabled={pending || disabled || Boolean(limitError)}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{pending ? "Préparation des textes et visuels…" : "Envoyer et générer la campagne"}</Button>
    </CardContent>
  </Card>;
}
