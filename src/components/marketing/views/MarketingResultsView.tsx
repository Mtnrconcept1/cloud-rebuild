import { useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Database, MousePointerClick, RefreshCw, Send, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MarketingEmptyState, MarketingMetricCard, MarketingStatusBadge, formatMarketingDate } from "@/components/marketing/MarketingShared";
import { analyticsIssues, analyticsMetricGroup, analyticsMetricLabel, analyticsMetricUnavailableLabel, analyticsSourceLabel, formatAnalyticsMetric, formatAnalyticsRate, type AnalyticsMetricGroup } from "@/components/marketing/analyticsPresentation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { resolveMarketingAnalyticsPeriod } from "@/marketing/analyticsPeriod";
import type { MarketingAutopilotDashboard, MarketingAutopilotMetric } from "@/marketing/autopilotTypes";
import { getMarketingCampaignDisplayStatus } from "@/marketing/campaignStatus";
import type { MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const METRIC_GROUPS: { key: AnalyticsMetricGroup; title: string; description: string }[] = [
  {
    key: "activity",
    title: "Activité marketing",
    description: "Contenus créés dans la période et publications confirmées. Les contenus en attente sont ceux prévus dans la période, à leur état actuel.",
  },
  {
    key: "delivery",
    title: "Diffusion et interactions",
    description: "Envois et interactions confirmés. Chaque retour de suivi est compté une seule fois par envoi et type d'événement.",
  },
  {
    key: "attribution",
    title: "Résultats commerciaux",
    description: "Prospects, conversions, dépenses et revenus reliés à une campagne. Les montants absents restent indisponibles.",
  },
];

function MetricCard({ metric }: { metric: MarketingAutopilotMetric }) {
  const available = metric.value !== null && Number.isFinite(metric.value);
  const observedAt = formatMarketingDate(metric.observedAt);
  return (
    <Card className={cn("h-full border-border/70 shadow-none", !available && "bg-muted/20")}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{analyticsMetricLabel(metric)}</h3>
          {available && metric.freshness !== "unknown" ? (
            <Badge variant="outline" className={cn("text-[10px]", metric.freshness === "fresh" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 text-amber-800 dark:text-amber-200")}>
              {metric.freshness === "fresh" ? "À jour" : "Observation ancienne"}
            </Badge>
          ) : null}
        </div>
        <p className={cn("mt-3 break-words text-2xl font-bold tabular-nums", !available && "text-base font-medium text-muted-foreground")}>{formatAnalyticsMetric(metric)}</p>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5"><Database className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /><span>{analyticsSourceLabel(metric.source)}</span></p>
          {available ? <p>{observedAt === "—" ? "Date d'observation non fournie" : `Dernière observation : ${observedAt}`}</p> : <p>{analyticsMetricUnavailableLabel(metric)}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketingResultsView({
  snapshot,
  filters,
  autopilot,
  autopilotLoading,
  autopilotError,
  onFiltersChange,
  onRefreshAutopilot,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  autopilot: MarketingAutopilotDashboard;
  autopilotLoading: boolean;
  autopilotError: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onRefreshAutopilot: () => void;
}) {
  const analytics = autopilot.analytics;
  const period = resolveMarketingAnalyticsPeriod(filters);
  const canShowMetrics = !period.error && !autopilotLoading && !autopilotError;
  const hasPeriodHistory = analytics.dailyResults !== undefined;
  const results = analytics.dailyResults ?? snapshot.results;
  const series = useMemo(() => results.filter((point) => (
    point.date >= period.from && point.date <= period.to
  )), [period.from, period.to, results]);
  const totals = series.reduce((current, point) => ({
    sent: current.sent + point.sent,
    delivered: current.delivered + point.delivered,
    clicks: current.clicks + point.clicks,
    conversions: current.conversions + point.conversions,
  }), { sent: 0, delivered: 0, clicks: 0, conversions: 0 });
  const historicalAvailable = (key: string) => !hasPeriodHistory || analytics.metrics.some((metric) => metric.key === key && metric.value !== null && Number.isFinite(metric.value));
  const historyAvailability = {
    sent: historicalAvailable("sent"),
    delivered: historicalAvailable("delivered"),
    clicks: historicalAvailable("clicks"),
    conversions: historicalAvailable("delivery_conversions"),
  };
  const historyHasMeasures = Object.values(historyAvailability).some(Boolean);
  const historyValue = (key: keyof typeof totals) => historyAvailability[key] ? totals[key].toLocaleString("fr-CH") : "Indisponible";
  const chartSeries = series.map((point) => ({
    ...point,
    sent: historyAvailability.sent ? point.sent : null,
    delivered: historyAvailability.delivered ? point.delivered : null,
    clicks: historyAvailability.clicks ? point.clicks : null,
    conversions: historyAvailability.conversions ? point.conversions : null,
  }));
  const availableCount = analytics.metrics.filter((metric) => metric.value !== null && Number.isFinite(metric.value)).length;
  const coverage = Math.min(100, Math.max(0, Math.round(analytics.completeness * 100)));
  const issues = analyticsIssues(analytics.unavailableReasons);
  const showHistory = !period.error && (!hasPeriodHistory || canShowMetrics);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">Activité, diffusion et résultats</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Suivez les contenus préparés, les diffusions confirmées et les résultats attribués à vos campagnes.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRefreshAutopilot} disabled={autopilotLoading || Boolean(period.error)}>
          <RefreshCw className={cn("mr-2 h-4 w-4", autopilotLoading && "animate-spin")} aria-hidden="true" />Actualiser les KPI
        </Button>
      </div>

      <section aria-labelledby="analytics-period-heading" className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="analytics-period-heading" className="text-sm font-semibold">Période analysée</h2><p id="analytics-period-help" className="mt-1 text-xs text-muted-foreground">Appliquée aux indicateurs et à l'historique. Journées complètes, heure suisse.</p></div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
            <div><Label htmlFor="results-from" className="text-xs">Du</Label><Input id="results-from" type="date" value={period.from} max={period.to || undefined} onChange={(event) => onFiltersChange({ from: event.target.value })} aria-invalid={Boolean(period.error)} aria-describedby={period.error ? "analytics-period-error" : "analytics-period-help"} className="mt-1 min-w-0" /></div>
            <div><Label htmlFor="results-to" className="text-xs">Au</Label><Input id="results-to" type="date" value={period.to} min={period.from || undefined} onChange={(event) => onFiltersChange({ to: event.target.value })} aria-invalid={Boolean(period.error)} aria-describedby={period.error ? "analytics-period-error" : "analytics-period-help"} className="mt-1 min-w-0" /></div>
          </div>
        </div>
        {period.error ? <p id="analytics-period-error" role="alert" className="mt-3 text-sm text-destructive">{period.error}</p> : null}
      </section>

      {autopilotError && !period.error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Analytics indisponibles</AlertTitle><AlertDescription>{autopilotError} Actualisez pour obtenir les mesures de la période sélectionnée.</AlertDescription></Alert> : null}

      <Card aria-busy={autopilotLoading}>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>KPI Autopilot</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{canShowMetrics ? `${availableCount} indicateur${availableCount > 1 ? "s" : ""} disponible${availableCount > 1 ? "s" : ""}${analytics.metrics.length ? ` sur ${analytics.metrics.length}` : ""}` : period.error ? "Choisissez une période valide" : autopilotLoading ? "Chargement des mesures…" : "Mesures à actualiser"}</p>
          </div>
          {canShowMetrics ? <div className="text-xs text-muted-foreground">Calculé le {formatMarketingDate(analytics.generatedAt || autopilot.generatedAt)}</div> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {canShowMetrics ? <div><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Couverture des données</span><span>{coverage} %</span></div><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Complétude des KPI" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage}><div className="h-full rounded-full bg-orange-500" style={{ width: `${coverage}%` }} /></div></div> : null}
          {autopilotLoading && !period.error ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>
          ) : canShowMetrics && analytics.metrics.length ? (
            METRIC_GROUPS.map((group) => {
              const metrics = analytics.metrics.filter((metric) => analyticsMetricGroup(metric) === group.key);
              if (!metrics.length) return null;
              return <section key={group.key} aria-labelledby={`analytics-${group.key}-heading`} className="space-y-3"><div><h2 id={`analytics-${group.key}-heading`} className="font-semibold">{group.title}</h2><p className="mt-1 text-xs text-muted-foreground">{group.description}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}</div></section>;
            })
          ) : canShowMetrics ? <MarketingEmptyState title="Aucun résultat confirmé pour cette période" description="Une campagne préparée ou approuvée attend encore sa diffusion. Les mesures apparaissent après confirmation des envois, publications ou interactions." /> : null}
          {canShowMetrics && issues.length ? <Alert className="border-amber-500/30 bg-amber-500/10"><AlertTriangle className="h-4 w-4" /><AlertTitle>Sources à compléter</AlertTitle><AlertDescription><ul className="mt-3 space-y-3">{issues.map((issue) => <li key={issue.key}><p className="font-medium">{issue.title}</p><p className="mt-0.5 text-xs leading-relaxed">{issue.description}</p></li>)}</ul></AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      {showHistory ? <section className="space-y-4 border-t pt-6" aria-labelledby="historical-results-heading">
        <div><h2 id="historical-results-heading" className="text-lg font-semibold">Événements historiques confirmés</h2><p className="text-sm text-muted-foreground">{hasPeriodHistory ? "Même période et mêmes événements, sans doublons, que les indicateurs de diffusion." : "Historique récent limité aux 30 derniers jours. Les dates plus anciennes ne sont pas couvertes par cette source."}</p></div>
        {series.length && historyHasMeasures ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Résultats historiques consolidés"><MarketingMetricCard label="Envois confirmés" value={historyValue("sent")} hint="Envois enregistrés dans la période" icon={Send} tone="sky" /><MarketingMetricCard label="Envois distribués" value={historyValue("delivered")} hint="Distributions enregistrées dans la période" icon={CheckCircle2} tone="emerald" /><MarketingMetricCard label="Envois avec clic" value={historyValue("clicks")} hint="Clics enregistrés dans la période" icon={MousePointerClick} tone="orange" /><MarketingMetricCard label="Envois avec conversion" value={historyValue("conversions")} hint="Conversions enregistrées dans la période" icon={TrendingUp} tone="violet" /></section> : null}
        {series.length && historyHasMeasures ? (
          <Card><CardHeader><CardTitle>Évolution quotidienne</CardTitle><p className="text-sm text-muted-foreground">Événements enregistrés par jour ; les mesures non confirmées ne sont pas tracées.</p></CardHeader><CardContent><div className="h-[320px] min-w-0" role="img" aria-label="Graphique des envois, distributions, clics et conversions par jour"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}><defs><linearGradient id="marketingDelivered" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient><linearGradient id="marketingClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00`).toLocaleDateString("fr-CH", { dateStyle: "long" })} /><Legend />{historyAvailability.sent ? <Area type="monotone" dataKey="sent" name="Envois confirmés" stroke="#0ea5e9" fill="transparent" strokeWidth={2} /> : null}{historyAvailability.delivered ? <Area type="monotone" dataKey="delivered" name="Envois distribués" stroke="#10b981" fill="url(#marketingDelivered)" strokeWidth={2} /> : null}{historyAvailability.clicks ? <Area type="monotone" dataKey="clicks" name="Envois avec clic" stroke="#f97316" fill="url(#marketingClicks)" strokeWidth={2} /> : null}{historyAvailability.conversions ? <Area type="monotone" dataKey="conversions" name="Envois avec conversion" stroke="#8b5cf6" fill="transparent" strokeWidth={2} /> : null}</AreaChart></ResponsiveContainer></div></CardContent></Card>
        ) : <MarketingEmptyState title="Aucun événement confirmé dans la période" description={snapshot.source === "fallback" && !hasPeriodHistory ? "L'historique n'est pas disponible. Actualisez les données pour réessayer." : "Élargissez les dates si vous recherchez une diffusion plus ancienne. Les brouillons ne créent pas de résultat."} />}
      </section> : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-500" />Performance par campagne</CardTitle><p className="text-sm text-muted-foreground">Cumul depuis la création de chaque campagne, indépendant de la période sélectionnée. Les taux restent indisponibles tant que leur base de calcul est absente.</p></CardHeader>
        <CardContent className="p-0 sm:p-4">
          {snapshot.campaigns.length ? <Table><TableHeader><TableRow><TableHead>Campagne</TableHead><TableHead>Statut</TableHead><TableHead>Envoyés</TableHead><TableHead>Distribution</TableHead><TableHead>Taux de clic</TableHead><TableHead>Conversions</TableHead></TableRow></TableHeader><TableBody>{snapshot.campaigns.map((campaign) => {
            const hasConfirmedActivity = campaign.sent > 0 || campaign.delivered > 0 || campaign.clicked > 0 || campaign.conversions > 0;
            return <TableRow key={campaign.id}><TableCell data-label="Campagne"><span className="font-semibold">{campaign.name}</span></TableCell><TableCell data-label="Statut"><MarketingStatusBadge status={getMarketingCampaignDisplayStatus(campaign)} /></TableCell><TableCell data-label="Envoyés">{hasConfirmedActivity ? campaign.sent.toLocaleString("fr-CH") : "Aucun envoi confirmé"}</TableCell><TableCell data-label="Distribution">{formatAnalyticsRate(campaign.delivered, campaign.sent)}</TableCell><TableCell data-label="Taux de clic">{formatAnalyticsRate(campaign.clicked, campaign.delivered)}</TableCell><TableCell data-label="Conversions">{hasConfirmedActivity ? campaign.conversions.toLocaleString("fr-CH") : "Indisponible"}</TableCell></TableRow>;
          })}</TableBody></Table> : <MarketingEmptyState title="Aucune campagne mesurable" description="Les performances apparaîtront après des événements réels et attribués." />}
        </CardContent>
      </Card>
    </div>
  );
}
