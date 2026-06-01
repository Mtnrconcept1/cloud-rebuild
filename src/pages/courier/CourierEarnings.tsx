import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, Calendar, Coins, Download, PiggyBank, Wallet } from "lucide-react";
import { toast } from "sonner";

import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCourierProfile } from "@/hooks/useCourierProfile";
import { fetchCourierEarnings, formatCurrency, mapCourierEarningTypeLabel } from "@/lib/courier";

function exportEarningsCsv(rows: any[]) {
  const header = ["date", "type", "description", "amount"];
  const content = rows.map((row) => [
    row.created_at,
    row.type,
    JSON.stringify(row.description || ""),
    Number(row.amount || 0).toFixed(2),
  ]);

  const csv = [header, ...content].map((line) => line.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `courier-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function CourierEarnings() {
  const { data: profile, isLoading: profileLoading } = useCourierProfile();

  const { data: earnings = [], isLoading } = useQuery({
    queryKey: ["courier-earnings", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierEarnings(profile!.id),
  });

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const monthKey = now.toISOString().slice(0, 7);

    const total = earnings.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const today = earnings
      .filter((row: any) => String(row.created_at || "").slice(0, 10) === todayKey)
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const week = earnings
      .filter((row: any) => Date.parse(row.created_at) >= weekStart.getTime())
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const month = earnings
      .filter((row: any) => String(row.created_at || "").slice(0, 7) === monthKey)
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

    const byType = earnings.reduce((acc: Record<string, number>, row: any) => {
      const key = String(row.type || "other");
      acc[key] = (acc[key] || 0) + Number(row.amount || 0);
      return acc;
    }, {});

    return { total, today, week, month, byType };
  }, [earnings]);

  if (profileLoading || isLoading) {
    return (
      <CourierDashboardLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((value) => (
            <div key={value} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </CourierDashboardLayout>
    );
  }

  return (
    <CourierDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold">Mes gains</h1>
            <p className="text-sm text-muted-foreground">
              Historique des courses, pourboires, bonus et ajustements.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              if (!earnings.length) {
                toast.error("Aucun mouvement a exporter.");
                return;
              }
              exportEarningsCsv(earnings);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardDescription className="text-primary-foreground/80">Total cumule</CardDescription>
              <CardTitle className="text-3xl">{formatCurrency(stats.total)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aujourd'hui</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats.today)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Cette semaine</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats.week)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ce mois</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats.month)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Repartition</CardTitle>
              <CardDescription>Vue par type de remuneration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(stats.byType).length > 0 ? (
                Object.entries(stats.byType).map(([type, amount]) => (
                  <div key={type} className="flex items-center justify-between rounded-xl border p-3">
                    <div className="flex items-center gap-2 text-sm">
                      {type === "delivery" ? (
                        <Bike className="h-4 w-4 text-muted-foreground" />
                      ) : type === "tip" ? (
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <PiggyBank className="h-4 w-4 text-muted-foreground" />
                      )}
                      {mapCourierEarningTypeLabel(type)}
                    </div>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Les mouvements de gains apparaitront ici après vos premières livraisons.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>Derniers mouvements enregistres sur votre compte coursier.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {earnings.length > 0 ? (
                earnings.map((earning: any) => (
                  <div key={earning.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{mapCourierEarningTypeLabel(String(earning.type || ""))}</p>
                      <p className="text-sm text-muted-foreground">{earning.description || "Mouvement coursier"}</p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(earning.created_at).toLocaleString("fr-CH")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-semibold text-emerald-600">
                      <Coins className="h-4 w-4" />
                      {formatCurrency(Number(earning.amount || 0))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Aucun gain n'a encore été genere.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </CourierDashboardLayout>
  );
}
