import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PerformanceHeroStatItem = {
  key: string;
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  accentClassName?: string;
};

export default function PerformanceHeroStats({
  items,
  columnsClassName = "md:grid-cols-3 xl:grid-cols-6",
}: {
  items: PerformanceHeroStatItem[];
  columnsClassName?: string;
}) {
  return (
    <div className={`grid gap-4 ${columnsClassName}`}>
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Card key={item.key} className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="h-4 w-4" />
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className={`text-2xl font-bold ${item.accentClassName || ""}`}>{item.value}</p>
              {item.helper ? <p className="text-xs text-muted-foreground">{item.helper}</p> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
