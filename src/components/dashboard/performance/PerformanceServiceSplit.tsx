import { MoonStar, SunMedium } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformanceServiceSummary } from "@/lib/dashboardPerformance";

function formatRevenue(value: number) {
  return `${value.toFixed(2)} CHF`;
}

export default function PerformanceServiceSplit({
  title,
  description,
  services,
}: {
  title: string;
  description?: string;
  services: PerformanceServiceSummary;
}) {
  const rows = [
    {
      key: "lunch",
      label: "Midi",
      icon: SunMedium,
      iconClassName: "text-amber-500",
      value: services.lunch,
    },
    {
      key: "dinner",
      label: "Soir",
      icon: MoonStar,
      iconClassName: "text-sky-500",
      value: services.dinner,
    },
  ] as const;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const Icon = row.icon;

            return (
              <div key={row.key} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.value.covers} couverts</p>
                  </div>
                  <Icon className={`h-5 w-5 ${row.iconClassName}`} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-background px-2 py-3 shadow-sm">
                    <p className="text-lg font-semibold">{row.value.count}</p>
                    <p className="text-[11px] text-muted-foreground">res.</p>
                  </div>
                  <div className="rounded-lg bg-background px-2 py-3 shadow-sm">
                    <p className="text-lg font-semibold">{row.value.covers}</p>
                    <p className="text-[11px] text-muted-foreground">couverts</p>
                  </div>
                  <div className="rounded-lg bg-background px-2 py-3 shadow-sm">
                    <p className="text-sm font-semibold">{formatRevenue(row.value.revenue)}</p>
                    <p className="text-[11px] text-muted-foreground">revenu</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {services.strongestService ? (
            <span className="rounded-full bg-muted px-3 py-1">
              Service dominant: {services.strongestService === "lunch" ? "Midi" : "Soir"}
            </span>
          ) : null}
          {services.weakestService && services.weakestService !== services.strongestService ? (
            <span className="rounded-full bg-muted px-3 py-1">
              Service plus faible: {services.weakestService === "lunch" ? "Midi" : "Soir"}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
