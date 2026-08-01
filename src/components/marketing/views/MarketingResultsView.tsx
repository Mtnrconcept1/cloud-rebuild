import { useMemo } from "react";
import { BarChart3, CheckCircle2, MousePointerClick, Send, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  MarketingEmptyState,
  MarketingMetricCard,
  MarketingStatusBadge,
  formatMarketingPercent,
} from "@/components/marketing/MarketingShared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

export default function MarketingResultsView({
  snapshot,
  filters,
  onFiltersChange,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
}) {
  const series = useMemo(() => snapshot.results.filter((point) => (
    (!filters.from || point.date >= filters.from)
    && (!filters.to || point.date <= filters.to)
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Mesure & attribution</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Résultats</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Les métriques manquantes restent à zéro ; elles ne sont jamais extrapolées à partir d'un autre canal.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="results-from" className="text-xs">Du</Label><Input id="results-from" type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} className="mt-1" /></div>
          <div><Label htmlFor="results-to" className="text-xs">Au</Label><Input id="results-to" type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} className="mt-1" /></div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Résultats consolidés">
        <MarketingMetricCard label="Envoyés" value={totals.sent.toLocaleString("fr-CH")} hint="Traitements confirmés dans la période" icon={Send} tone="sky" />
        <MarketingMetricCard label="Distribués" value={totals.delivered.toLocaleString("fr-CH")} hint={formatMarketingPercent(deliveryRate)} icon={CheckCircle2} tone="emerald" />
        <MarketingMetricCard label="Clics" value={totals.clicks.toLocaleString("fr-CH")} hint={formatMarketingPercent(clickRate)} icon={MousePointerClick} tone="orange" />
        <MarketingMetricCard label="Conversions" value={totals.conversions.toLocaleString("fr-CH")} hint={formatMarketingPercent(conversionRate)} icon={TrendingUp} tone="violet" />
      </section>

      {series.length ? (
        <Card>
          <CardHeader><CardTitle>Évolution quotidienne</CardTitle><p className="text-sm text-muted-foreground">Volumes confirmés par événement backend.</p></CardHeader>
          <CardContent>
            <div className="h-[320px] min-w-0" role="img" aria-label="Graphique des envois, distributions, clics et conversions par jour">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                  <defs><linearGradient id="marketingDelivered" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient><linearGradient id="marketingClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(value) => new Date(`${String(value)}T12:00:00`).toLocaleDateString("fr-CH", { dateStyle: "long" })} />
                  <Legend />
                  <Area type="monotone" dataKey="delivered" name="Distribués" stroke="#10b981" fill="url(#marketingDelivered)" strokeWidth={2} />
                  <Area type="monotone" dataKey="clicks" name="Clics" stroke="#f97316" fill="url(#marketingClicks)" strokeWidth={2} />
                  <Area type="monotone" dataKey="conversions" name="Conversions" stroke="#8b5cf6" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : (
        <MarketingEmptyState title="Aucun résultat confirmé" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucun graphique ou chiffre synthétique n'est généré." : "Aucun événement ne correspond à la période sélectionnée."} />
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-500" />Performance par campagne</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-4">
          {snapshot.campaigns.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Campagne</TableHead><TableHead>Statut</TableHead><TableHead>Envoyés</TableHead><TableHead>Distribution</TableHead><TableHead>CTR distribué</TableHead><TableHead>Conversions</TableHead></TableRow></TableHeader>
              <TableBody>{snapshot.campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell data-label="Campagne"><span className="font-semibold">{campaign.name}</span></TableCell><TableCell data-label="Statut"><MarketingStatusBadge status={campaign.status} /></TableCell><TableCell data-label="Envoyés">{campaign.sent.toLocaleString("fr-CH")}</TableCell><TableCell data-label="Distribution">{formatMarketingPercent(campaign.sent ? campaign.delivered / campaign.sent : 0)}</TableCell><TableCell data-label="CTR">{formatMarketingPercent(campaign.delivered ? campaign.clicked / campaign.delivered : 0)}</TableCell><TableCell data-label="Conversions">{campaign.conversions.toLocaleString("fr-CH")}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <MarketingEmptyState title="Aucune campagne mesurable" description="Les performances apparaîtront après des événements réels et attribués." />}
        </CardContent>
      </Card>
    </div>
  );
}

