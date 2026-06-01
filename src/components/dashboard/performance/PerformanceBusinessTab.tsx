import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CalendarDays,
  CreditCard,
  DollarSign,
  Percent,
  Receipt,
  ShoppingCart,
  Star,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";

import PerformanceHeroStats from "@/components/dashboard/performance/PerformanceHeroStats";
import PerformanceInsights from "@/components/dashboard/performance/PerformanceInsights";
import PerformanceServiceSplit from "@/components/dashboard/performance/PerformanceServiceSplit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformanceInsight, PerformanceServiceSummary, PerformanceSummary } from "@/lib/dashboardPerformance";
import type { Database } from "@/integrations/supabase/types";

type RestaurantInvoiceRow = Database["public"]["Tables"]["restaurant_invoices"]["Row"];

function formatChf(value: number, digits = 2) {
  return `${value.toFixed(digits)} CHF`;
}

export default function PerformanceBusinessTab({
  summary,
  chartData,
  insights,
  serviceSummary,
  invoices,
}: {
  summary: PerformanceSummary;
  chartData: Array<{ date: string; orders: number; revenue: number; avgTicket: number }>;
  insights: PerformanceInsight[];
  serviceSummary: PerformanceServiceSummary;
  invoices: RestaurantInvoiceRow[];
}) {
  const latestInvoice = invoices[0] || null;
  const draftCount = invoices.filter((invoice) => invoice.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-gradient-to-br from-background via-background to-muted/30 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Analyse business</p>
          <h2 className="font-display text-2xl font-bold">Comprendre la trajectoire de votre restaurant</h2>
          <p className="text-sm text-muted-foreground">
            Lecture periode, tendances de revenus, poids des remises et signaux utiles pour ajuster vos decisions.
          </p>
        </div>
      </div>

      <PerformanceHeroStats
        items={[
          {
            key: "period-revenue-net",
            label: "CA net",
            value: formatChf(summary.totalRevenue, 0),
            helper: `${summary.validOrdersCount} commandes valides`,
            icon: DollarSign,
            accentClassName: "text-primary",
          },
          {
            key: "period-revenue-gross",
            label: "CA brut",
            value: formatChf(summary.grossRevenue, 0),
            helper: "CA reconstitue avec remises",
            icon: Receipt,
          },
          {
            key: "period-orders",
            label: "Commandes",
            value: String(summary.validOrdersCount),
            helper: `${summary.invalidOrdersCount} commande(s) invalides`,
            icon: ShoppingCart,
          },
          {
            key: "period-ticket",
            label: "Panier moyen",
            value: summary.avgTicket > 0 ? formatChf(summary.avgTicket, 1) : "-",
            helper: "Sur les commandes valides",
            icon: TrendingUp,
          },
          {
            key: "period-reservations",
            label: "Reservations",
            value: String(summary.totalReservations),
            helper: "Sur la periode",
            icon: CalendarDays,
          },
          {
            key: "period-rating",
            label: "Satisfaction",
            value: summary.avgSatisfaction > 0 ? `${summary.avgSatisfaction.toFixed(1)}/5` : "-",
            helper: "Moyenne des avis visibles",
            icon: Star,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Evolution du chiffre d'affaires</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="performanceRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#performanceRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <PerformanceInsights insights={insights} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Commandes et panier moyen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Line type="monotone" dataKey="avgTicket" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <PerformanceServiceSplit
          title="Mix d'activite"
          description="Lecture du poids du midi et du soir sur la periode choisie."
          services={serviceSummary}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4" />
              Leviers commerciaux
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <span>Formules</span>
              <span>-{summary.discounts.formula.toFixed(2)} CHF</span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <span>Promotions</span>
              <span>-{summary.discounts.promo.toFixed(2)} CHF</span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <span>Fidélité</span>
              <span>-{summary.discounts.loyalty.toFixed(2)} CHF</span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <span>Flex</span>
              <span>-{summary.discounts.flex.toFixed(2)} CHF</span>
            </div>
            <div className="flex justify-between rounded-lg border px-3 py-2 font-semibold">
              <span>Total remises</span>
              <span>-{summary.discounts.total.toFixed(2)} CHF</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Lecture comptable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">CA net</p>
                <p className="mt-1 text-xl font-semibold">{formatChf(summary.totalRevenue)}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">CA brut estimé</p>
                <p className="mt-1 text-xl font-semibold">{formatChf(summary.grossRevenue)}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Ticket comptable</p>
                <p className="mt-1 text-xl font-semibold">{formatChf(summary.accountingAvgTicket)}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Le CA net exclut les commandes annulées, refusees et en échec de paiement.</p>
              <p>Le CA brut estimé reconstitue les remises retrouvees dans les metadonnees de commande.</p>
              <p>Les réservations sont bornees à la periode sélectionnée sans projection future.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Facturation en contexte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {latestInvoice ? `Derniere facturé: ${latestInvoice.period_start} -> ${latestInvoice.period_end}` : "Aucune facturé récente"}
            </p>
            <p className="text-sm text-muted-foreground">
              {latestInvoice
                ? `TTC ${Number(latestInvoice.amount_ttc).toFixed(2)} CHF · statut ${latestInvoice.status || "draft"}`
                : "Consultez la compta pour voir vos documents et encours."}
            </p>
            {draftCount > 0 ? (
              <p className="text-xs text-muted-foreground">{draftCount} facturé(s) encore en brouillon ou a relire.</p>
            ) : null}
          </div>
          <Button asChild variant="outline">
            <Link to="/dashboard/factures">Ouvrir les factures</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
