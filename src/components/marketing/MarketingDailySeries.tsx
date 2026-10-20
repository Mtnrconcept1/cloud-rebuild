import { useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, CirclePause, Instagram, Play, RefreshCw } from "lucide-react";

import { MarketingPostImage } from "@/components/marketing/MarketingPostPreview";
import { MarketingStatusBadge, formatMarketingDate } from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isMarketingDailyLocalTime, marketingDailyErrorLabel, type MarketingDailySeriesStatus } from "@/marketing/dailySeriesClient";
import { useMarketingDailySeries } from "@/marketing/useMarketingDailySeries";
import type { MarketingNavigate } from "@/marketing/useMarketingUrlState";

export function MarketingDailySeries({ canMutateBackend, onNavigate }: {
  canMutateBackend: boolean;
  onNavigate: MarketingNavigate;
}) {
  const daily = useMarketingDailySeries({ canMutateBackend });
  const [draft, setDraft] = useState<{ localTime: string; version: number } | null>(null);
  const [referenceMissing, setReferenceMissing] = useState(false);
  const dashboard = daily.dashboard;
  const series = dashboard?.series;
  const localTime = draft?.localTime ?? series?.localTime ?? "";
  const validTime = isMarketingDailyLocalTime(localTime);
  const ready = Boolean(dashboard?.runtimeEnabled && dashboard.schedulerReady);
  const editable = Boolean(series && canMutateBackend && !daily.saving && !daily.error && !daily.conflict);
  const running = series?.status === "active";
  const lastError = marketingDailyErrorLabel(series?.lastError ?? null);

  const refresh = async () => {
    if (await daily.refresh()) setDraft(null);
  };

  const save = async (status: MarketingDailySeriesStatus, time: string, version: number) => {
    if (!editable) return;
    if (await daily.save({ status, localTime: time, expectedVersion: version })) setDraft(null);
  };

  return (
    <Card id="instagram-daily-series" className="min-w-0 border-orange-500/30" aria-labelledby="marketing-daily-title">
      <CardHeader className="gap-3 bg-orange-500/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
              <Instagram className="h-4 w-4 shrink-0" aria-hidden />Série continue
            </p>
            <h2 id="marketing-daily-title" className="mt-2 text-xl font-bold tracking-tight">Instagram · un post par jour</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {series ? <MarketingStatusBadge status={!canMutateBackend || daily.error ? "État à vérifier" : !running ? "paused" : ready && series.ownerAuthorized ? "active" : "blocked_configuration"} /> : null}
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refresh()}
              disabled={!canMutateBackend || daily.saving || daily.refreshing} aria-label="Actualiser la série quotidienne">
              <RefreshCw className={cn("mr-2 h-4 w-4", daily.refreshing && "motion-safe:animate-spin")} aria-hidden />Actualiser
            </Button>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Un nouveau brouillon chaque jour. Validez chaque post pour le publier sur Instagram.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">1 visuel au format 4:5</Badge>
          <Badge variant="secondary">Sans date de fin</Badge>
          <Badge variant="secondary">Heure de Genève</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Les sujets et les scènes alternent, avec un seul message clair par post. Le chef, le logo,
          les couleurs et la typographie TOK restent cohérents avec les références à chaque génération.
        </p>

        {daily.loading ? <div aria-label="Chargement de la série quotidienne" className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-11 w-48" /></div> : null}
        {!canMutateBackend ? <Alert><AlertCircle className="h-4 w-4" aria-hidden /><AlertTitle>Connexion marketing à vérifier</AlertTitle><AlertDescription>Les réglages seront disponibles dès que votre espace marketing aura pu être chargé.</AlertDescription></Alert> : null}
        {daily.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden /><AlertTitle>Série indisponible</AlertTitle><AlertDescription>{daily.error}</AlertDescription></Alert> : null}
        {daily.notice ? <Alert role={daily.notice.tone === "error" ? "alert" : "status"} variant={daily.notice.tone === "error" ? "destructive" : "default"}>
          {daily.notice.tone === "success" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}
          <AlertTitle>{daily.notice.tone === "success" ? "Réglages enregistrés" : "Réglages non confirmés"}</AlertTitle>
          <AlertDescription className="space-y-3"><p>{daily.notice.message}</p>{daily.conflict ? <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refresh()} disabled={daily.refreshing}>Recharger les réglages</Button> : null}</AlertDescription>
        </Alert> : null}

        {dashboard && series ? <>
          {!ready ? <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertCircle className="h-4 w-4" aria-hidden /><AlertTitle>Génération quotidienne en attente</AlertTitle>
            <AlertDescription>
              {!dashboard.runtimeEnabled ? "Le service de génération doit être activé. " : ""}
              {!dashboard.schedulerReady ? "La planification quotidienne doit être configurée. " : ""}
              L’activation sera disponible une fois ces éléments prêts.
            </AlertDescription>
          </Alert> : null}
          {running && !series.ownerAuthorized ? <Alert className="border-amber-500/30 bg-amber-500/5"><AlertCircle className="h-4 w-4" aria-hidden /><AlertTitle>Autorisation à renouveler</AlertTitle><AlertDescription className="space-y-3"><p>Un administrateur doit confirmer la reprise de cette série.</p><Button type="button" variant="outline" className="min-h-11" disabled={!editable || !ready || !validTime} onClick={() => void save("active", localTime, draft?.version ?? series.version)}>Renouveler l’autorisation</Button></AlertDescription></Alert> : null}

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3"><dt className="text-xs text-muted-foreground">Prochaine production</dt><dd className="mt-1 break-words text-sm font-semibold">{!running ? "Après activation" : !ready || !series.ownerAuthorized ? "En attente de configuration" : formatMarketingDate(series.nextRunAt)}</dd></div>
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3"><dt className="text-xs text-muted-foreground">Brouillons créés</dt><dd className="mt-1 text-sm font-semibold">{series.generatedCount.toLocaleString("fr-CH")}</dd></div>
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3"><dt className="text-xs text-muted-foreground">Dernière production lancée</dt><dd className="mt-1 break-words text-sm font-semibold">{formatMarketingDate(series.lastRunAt)}</dd></div>
          </dl>

          <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            if (validTime) void save(series.status, localTime, draft?.version ?? series.version);
          }}>
            <div className="min-w-0 sm:w-56">
              <Label htmlFor="marketing-daily-time">Heure de génération</Label>
              <Input id="marketing-daily-time" type="time" step={60} required value={localTime} disabled={!editable}
                className="mt-2 min-h-11" aria-describedby="marketing-daily-time-hint" aria-invalid={Boolean(draft && !validTime)}
                onChange={(event) => setDraft({ localTime: event.target.value, version: draft?.version ?? series.version })} />
              <p id="marketing-daily-time-hint" className="mt-2 text-xs text-muted-foreground">Europe/Zurich · changement d’heure automatique</p>
            </div>
            <div className="flex flex-col gap-2 sm:mb-6 sm:flex-row sm:flex-wrap">
              <Button type="submit" variant="outline" className="min-h-11" disabled={!editable || !validTime || localTime === series.localTime || (running && !ready)}>Enregistrer l’heure</Button>
              {running ? <Button type="button" variant="outline" className="min-h-11" disabled={!editable} onClick={() => void save("paused", series.localTime, series.version)}><CirclePause className="mr-2 h-4 w-4" aria-hidden />Mettre en pause</Button>
                : <Button type="button" className="min-h-11" disabled={!editable || !ready || !validTime} onClick={() => void save("active", localTime, draft?.version ?? series.version)}><Play className="mr-2 h-4 w-4" aria-hidden />{series.activatedAt ? "Reprendre la série" : "Activer la série"}</Button>}
              {daily.saving ? <span role="status" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden />Enregistrement…</span> : null}
            </div>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">Chaque jour, la série prépare un visuel individuel et sa légende. Les brouillons attendent votre validation dans le calendrier.</p>
          {lastError ? <p role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">{lastError}</p> : null}

          <section aria-labelledby="marketing-daily-history-title" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 id="marketing-daily-history-title" className="font-semibold">Dernières productions</h3><span className="text-xs text-muted-foreground">30 dernières productions</span></div>
            {dashboard.recentRuns.length ? <ul className="divide-y rounded-xl border">
              {dashboard.recentRuns.map((run) => <li key={run.id} className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  {run.imageUrl ? <MarketingPostImage url={run.imageUrl} title={run.title} compact /> : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{run.title}</p>
                    <p className="text-xs text-muted-foreground">{run.localDate ? run.localDate.split("-").reverse().join(".") : formatMarketingDate(run.scheduledAt, false)} · {run.attemptCount} tentative{run.attemptCount > 1 ? "s" : ""}</p>
                    <MarketingStatusBadge status={run.status === "succeeded" ? "completed" : run.status === "unknown" ? "État à vérifier" : run.status} />
                    {run.lastError ? <p className="break-words text-xs text-amber-800 dark:text-amber-200">{marketingDailyErrorLabel(run.lastError)}</p> : null}
                    {run.status === "retrying" && run.nextAttemptAt ? <p className="text-xs text-muted-foreground">Nouvelle tentative : {formatMarketingDate(run.nextAttemptAt)}</p> : null}
                  </div>
                </div>
                {run.calendarItemId ? <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => onNavigate("calendar", {
                  itemId: run.calendarItemId ?? undefined,
                  campaignId: run.campaignId ?? undefined,
                  scheduledAt: run.scheduledAt ?? undefined,
                })}><CalendarClock className="mr-2 h-4 w-4" aria-hidden />Voir le post</Button> : null}
              </li>)}
            </ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucune production enregistrée. Une fois la série active, le premier brouillon apparaîtra ici après son créneau de génération.</p>}
          </section>
        </> : null}

        <details className="rounded-xl border p-3">
          <summary className="min-h-8 cursor-pointer text-sm font-medium">Voir la référence de style du profil Instagram</summary>
          <p className="my-3 text-xs text-muted-foreground">Cette capture guide l’identité de la série. Chaque génération produit un seul post indépendant.</p>
          {referenceMissing ? <p className="text-sm text-muted-foreground">La référence de style ne peut pas être affichée pour le moment.</p>
            : <img src="/marketing/brand/tok-v2/instagram-profile.jpeg" alt="Référence de style du profil Instagram TOK" width={707} height={1536} loading="lazy" decoding="async" className="h-auto w-full max-w-sm rounded-lg" onError={() => setReferenceMissing(true)} />}
        </details>
      </CardContent>
    </Card>
  );
}
