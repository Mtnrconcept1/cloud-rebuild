import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformanceAlert } from "@/lib/dashboardPerformance";

const toneMap = {
  warning: {
    icon: AlertTriangle,
    titleClassName: "text-amber-700",
    iconClassName: "text-amber-500",
  },
  positive: {
    icon: CheckCircle2,
    titleClassName: "text-emerald-700",
    iconClassName: "text-emerald-500",
  },
  neutral: {
    icon: Info,
    titleClassName: "text-slate-700",
    iconClassName: "text-slate-500",
  },
} as const;

export default function PerformanceAlerts({ alerts }: { alerts: PerformanceAlert[] }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">A surveiller</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => {
          const tone = toneMap[alert.tone];
          const Icon = tone.icon;

          return (
            <div key={alert.id} className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-background p-2 shadow-sm">
                  <Icon className={`h-4 w-4 ${tone.iconClassName}`} />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className={`text-sm font-semibold ${tone.titleClassName}`}>{alert.title}</p>
                  <p className="text-sm text-muted-foreground">{alert.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
