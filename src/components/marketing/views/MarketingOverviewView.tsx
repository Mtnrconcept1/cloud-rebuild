import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  MousePointerClick,
  PlayCircle,
  Send,
  Users,
} from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingMetricCard,
  MarketingStatusBadge,
  formatMarketingDate,
  formatMarketingPercent,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { MarketingSnapshot, MarketingView } from "@/marketing/types";

export default function MarketingOverviewView({
  snapshot,
  canMutateBackend,
  runPending,
  onRunDue,
  onNavigate,
}: {
  snapshot: MarketingSnapshot;
  canMutateBackend: boolean;
  runPending: boolean;
  onRunDue: () => Promise<unknown>;
  onNavigate: (view: MarketingView) => void;
}) {
  const overview = snapshot.overview;
  const availableChannels = snapshot.channels.filter((channel) => channel.availability === "available").length;
  const blockedChannels = snapshot.channels.filter((channel) => ["blocked_configuration", "disconnected"].includes(channel.availability)).length;
  const upcoming = [...snapshot.calendar]
    .filter((item) => new Date(item.scheduledAt).getTime() >= Date.now())
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-[#0b1728] via-[#0b1d32] to-[#13253c] p-5 text-white shadow-xl shadow-slate-950/10 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-1 text-xs font-semibold text-orange-200">Mode gratuit strict</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Approbation obligatoire</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Source : {snapshot.source === "backend" ? "backend" : snapshot.source === "mixed" ? "partielle" : "indisponible"}</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-4xl">Pilotez l'acquisition sans perdre le contrôle.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Une vue unique sur les campagnes, audiences, tâches manuelles et résultats. Les canaux non configurés restent bloqués par défaut.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => onNavigate("campaigns")}>
              Nouvelle campagne
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              type="button"
              className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
              disabled={!canMutateBackend || overview.globalPaused || !overview.schedulerReady || runPending}
              onClick={onRunDue}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Traiter les éléments dus
            </Button>
          </div>
        </div>
      </section>

      {snapshot.warnings.map((warning) => (
        <Alert key={warning} className="border-amber-500/25 bg-amber-500/5">
          <CircleGauge className="h-4 w-4 text-amber-600" />
          <AlertTitle>État de sécurité</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs marketing">
        <MarketingMetricCard label="Contacts éligibles" value={overview.eligibleContacts.toLocaleString("fr-CH")} hint="Après consentement, opposition et joignabilité" icon={Users} tone="sky" />
        <MarketingMetricCard label="Planifiés" value={overview.scheduledCount.toLocaleString("fr-CH")} hint="Éléments approuvés ou en attente d'approbation" icon={CalendarClock} tone="orange" />
        <MarketingMetricCard label="Distribués" value={overview.delivered.toLocaleString("fr-CH")} hint={`Taux de distribution ${formatMarketingPercent(overview.deliveryRate)}`} icon={Send} tone="emerald" />
        <MarketingMetricCard label="Conversions" value={overview.conversions.toLocaleString("fr-CH")} hint={`Conversion après clic ${formatMarketingPercent(overview.conversionRate)}`} icon={MousePointerClick} tone="violet" />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Prochaines opérations</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Heure suisse · seulement les éléments confirmés par le backend</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate("calendar")}>Tout voir</Button>
          </CardHeader>
          <CardContent>
            {upcoming.length ? (
              <div className="space-y-3">
                {upcoming.map((item) => (
                  <div key={item.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 p-3 sm:flex-row sm:items-center">
                    <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{new Date(item.scheduledAt).toLocaleDateString("fr-CH", { month: "short", timeZone: "Europe/Zurich" })}</span>
                      <span className="text-lg font-bold">{new Date(item.scheduledAt).toLocaleDateString("fr-CH", { day: "2-digit", timeZone: "Europe/Zurich" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.campaignName} · {formatMarketingDate(item.scheduledAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <MarketingChannelBadge channel={item.channel} />
                      <MarketingStatusBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MarketingEmptyState title="Aucune opération planifiée" description="Le calendrier backend ne contient aucun élément futur. Créez une campagne pour préparer un premier brouillon." />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Santé des canaux</CardTitle>
            <p className="text-sm text-muted-foreground">Aucun canal n'est supposé actif sans preuve serveur.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Disponibles</span>
                <span>{availableChannels}/{snapshot.channels.length}</span>
              </div>
              <Progress className="mt-2 h-2" value={snapshot.channels.length ? (availableChannels / snapshot.channels.length) * 100 : 0} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="mt-2 text-2xl font-bold">{availableChannels}</p>
                <p className="text-xs text-muted-foreground">confirmés</p>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-3">
                <CircleGauge className="h-4 w-4 text-rose-600" />
                <p className="mt-2 text-2xl font-bold">{blockedChannels}</p>
                <p className="text-xs text-muted-foreground">bloqués/déconnectés</p>
              </div>
            </div>
            <div className="space-y-2">
              {snapshot.channels.slice(0, 6).map((channel) => (
                <div key={channel.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="truncate text-sm font-medium">{channel.label}</span>
                  <MarketingStatusBadge status={channel.availability} />
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => onNavigate("integrations")}>Examiner les intégrations</Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
