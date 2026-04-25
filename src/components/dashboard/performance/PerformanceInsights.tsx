import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformanceInsight } from "@/lib/dashboardPerformance";

export default function PerformanceInsights({
  title = "Ce que ca raconte",
  insights,
}: {
  title?: string;
  insights: PerformanceInsight[];
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight) => (
          <div key={insight.id} className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">{insight.label}</p>
              <p className="text-lg font-semibold">{insight.value}</p>
            </div>
            <p className="mt-2 text-sm text-foreground/80">{insight.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
