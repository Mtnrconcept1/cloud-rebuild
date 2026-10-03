import { useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Database, MousePointerClick, RefreshCw, Send, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MarketingEmptyState, MarketingMetricCard, MarketingStatusBadge, formatMarketingDate, formatMarketingPercent } from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MarketingAutopilotDashboard, MarketingAutopilotMetric } from "@/marketing/autopilotTypes";
import type { MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

function formatNullableMetric(metric: MarketingAutopilotMetric) {
  if (metric.value === null) return "Indisponible";
  if (metric.unit === "CHF") return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 2 }).format(metric.value);
  if (metric.unit === "%") return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(Math.abs(metric.value) <= 1 ? metric.value * 100 : metric.value)} %`;
  if (metric.unit === "x") return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(metric.value)}×`;
  return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`;
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
  const series = useMemo(() => snapshot.results.filter((point) => (
    (!filters.from || point.date >= filters.from) && (!filters.to || point.date <= filters.to)
  )), [filters.from, filters.to, snapshot.results]);
  const totals = series.reduce((current, point) => ({
    sent: current.sent + point.sent,
    delivered: current.delivered + point.delivered,
    clicks: current.clicks + point.clicks,
    conversions: current.conversions + point.conversions,
  }), { sent: 0, delivered: 0, clicks: 0, conversions: 0 });
  const deliveryRate = totals.sent ? totals.delivered / totals.sent : 0;
  const clickRate = totals.delivered ? totals.clicks / totals.delivered : 0;
  const conversionRate = totals.clicks ? totals.conversions / totals.clicks : 0;
  const analytics = autopilot.analytics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-300">Mesure, provenance et fraîcheur</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Une donnée absente reste « Indisponible ». Aucun zéro n'est inventé et chaque KPI indique sa source et sa fraîcheur lorsqu'elles sont connues.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRefreshAutopilot} disabled={autopilotLoading}><RefreshCw className={cn("mr-2 h-4 w-4", autopilotLoading && "animate-spin")} />Actualiser les KPI</Button>
      </div>

      {autopilotError ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Analytics indisponibles</AlertTitle><AlertDescription>{autopilotError} Les KPI ne sont ni extrapolés ni remplacés par zéro.</AlertDescription></Alert> : null}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>KPI Autopilot</CardTitle><p className="mt-1 text-sm text-muted-foreground">Complétude : {new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 0 }).format(analytics.completeness)}</p></div>
          <div className="text-xs text-muted-foreground">Généré {formatMarketingDate(analytics.generatedAt || autopilot.generatedAt)}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Complétude des KPI" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(analytics.completeness * 100)}><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round(analytics.completeness * 100)}%` }} /></div>
          {autopilotLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>
          ) : analytics.metrics.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analytics.metrics.map((metric) => (
                <Card key={metric.key} className="border-border/70 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p><Badge variant="outline" className={cn(metric.freshness === "fresh" && "border-emerald-500/30 text-emerald-700 dark:text-emerald-300", metric.freshness === "stale" && "border-amber-500/30 text-amber-800 dark:text-amber-200")}>{metric.freshness === "fresh" ? "À jour" : metric.freshness === "stale" ? "À rafraîchir" : "Fraîcheur inconnue"}</Badge></div>
                    <p className={cn("mt-3 break-words text-2xl font-bold", metric.value === null && "text-base text-muted-foreground")}>{formatNullableMetric(metric)}</p>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />Source : {metric.source || "non fournie"}</p><p>Observation : {formatMarketingDate(metric.observedAt)}</p>{metric.unavailableReason ? <p className="text-amber-900 dark:text-amber-100">{metric.unavailableReason}</p> : null}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <MarketingEmptyState title="Aucun KPI confirmé" description="Le backend n'a fourni aucune métrique exploitable. Les valeurs restent indisponibles." />}
          {analytics.unavailableReasons.length ? <Alert className="border-amber-500/30 bg-amber-500/10"><AlertTriangle className="h-4 w-4" /><AlertTitle>Données incomplètes</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{analytics.unavailableReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      <section className="space-y-4 border-t pt-6" aria-labelledby="historical-results-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="historical-results-heading" className="text-lg font-semibold">Événements historiques confirmés</h2><p className="text-sm text-muted-foreground">Série existante, distincte des KPI consolidés.</p></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="results-from" className="text-xs">Du</Label><Input id="results-from" type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} className="mt-1" /></div><div><Label htmlFor="results-to" className="text-xs">Au</Label><Input id="results-to" type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} className="mt-1" /></div></div></div>

        {series.length ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Résultats historiques consolidés"><MarketingMetricCard label="Envoyés" value={totals.sent.toLocaleString("fr-CH")} hint="Traitements confirmés dans la période" icon={Send} tone="sky" /><MarketingMetricCard label="Distribués" value={totals.delivered.toLocaleString("fr-CH")} hint={formatMarketingPercent(deliveryRate)} icon={CheckCircle2} tone="emerald" /><MarketingMetricCard label="Clics" value={totals.clicks.toLocaleString("fr-CH")} hint={formatMarketingPercent(clickRate)} icon={MousePointerClick} tone="orange" /><MarketingMetricCard label="Conversions" value={totals.conversions.toLocaleString("fr-CH")} hint={formatMarketingPercent(conversionRate)} icon={TrendingUp} tone="violet" /></section> : null}

        {series.length ? (
          <Card><CardHeader><CardTitle>Évolution quotidienne</CardTitle><p className="text-sm text-muted-foreground">Volumes confirmés par événement backend.</p></CardHeader><CardContent><div className="h-[320px] min-w-0" role="img" aria-label="Graphique des envois, distributions, clics et conversions par jour"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}><defs><linearGradient id="marketingDelivered" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient><linearGradient id="marketingClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00`).toLocaleDateString("fr-CH", { dateStyle: "long" })} /><Legend /><Area type="monotone" dataKey="delivered" name="Distribués" stroke="#10b981" fill="url(#marketingDelivered)" strokeWidth={2} /><Area type="monotone" dataKey="clicks" name="Clics" stroke="#f97316" fill="url(#marketingClicks)" strokeWidth={2} /><Area type="monotone" dataKey="conversions" name="Conversions" stroke="#8b5cf6" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
        ) : <MarketingEmptyState title="Aucun résultat historique confirmé" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucun zéro synthétique n'est affiché." : "Aucun événement ne correspond à la période sélectionnée."} />}
      </section>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-500" />Performance par campagne</CardTitle></CardHeader><CardContent className="p-0 sm:p-4">{snapshot.campaigns.length ? <Table><TableHeader><TableRow><TableHead>Campagne</TableHead><TableHead>Statut</TableHead><TableHead>Envoyés</TableHead><TableHead>Distribution</TableHead><TableHead>CTR distribué</TableHead><TableHead>Conversions</TableHead></TableRow></TableHeader><TableBody>{snapshot.campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell data-label="Campagne"><span className="font-semibold">{campaign.name}</span></TableCell><TableCell data-label="Statut"><MarketingStatusBadge status={campaign.status} /></TableCell><TableCell data-label="Envoyés">{campaign.sent.toLocaleString("fr-CH")}</TableCell><TableCell data-label="Distribution">{formatMarketingPercent(campaign.sent ? campaign.delivered / campaign.sent : 0)}</TableCell><TableCell data-label="CTR">{formatMarketingPercent(campaign.delivered ? campaign.clicked / campaign.delivered : 0)}</TableCell><TableCell data-label="Conversions">{campaign.conversions.toLocaleString("fr-CH")}</TableCell></TableRow>)}</TableBody></Table> : <MarketingEmptyState title="Aucune campagne mesurable" description="Les performances apparaîtront après des événements réels et attribués." />}</CardContent></Card>
    </div>
  );
}
