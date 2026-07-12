import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type BreakdownTone = "emerald" | "sky" | "violet" | "orange" | "amber" | "rose" | "slate";

const BAR_CLASSES: Record<BreakdownTone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

export type AccountingBreakdownItem = {
  label: string;
  amount: number;
  helper?: string;
  tone?: BreakdownTone;
};

type AccountingBreakdownCardProps = {
  title: string;
  description: string;
  totalLabel: string;
  total: number;
  items: readonly AccountingBreakdownItem[];
  formatValue: (value: number) => string;
  className?: string;
};

function getPercentage(amount: number, denominator: number) {
  if (denominator <= 0 || amount <= 0) return 0;
  return Math.min(100, (amount / denominator) * 100);
}

function formatPercentage(value: number) {
  return `${value.toLocaleString("fr-CH", {
    minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
    maximumFractionDigits: 1,
  })} %`;
}

export function AccountingBreakdownCard({
  title,
  description,
  totalLabel,
  total,
  items,
  formatValue,
  className,
}: AccountingBreakdownCardProps) {
  const positiveTotal = items.reduce((sum, item) => sum + Math.max(0, item.amount), 0);

  return (
    <Card className={cn("min-w-0 overflow-hidden rounded-3xl border border-border/70", className)}>
      <CardHeader className="space-y-4 pb-4">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <CardTitle className="font-display text-xl font-bold tracking-tight text-foreground dark:text-white sm:text-2xl">
              {title}
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 dark:text-slate-100/78">
              {description}
            </CardDescription>
          </div>
          <div className="min-w-0 rounded-2xl bg-muted/55 px-4 py-3 sm:shrink-0 sm:text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{totalLabel}</p>
            <p className="mt-1 break-words text-2xl font-bold tracking-tight text-foreground dark:text-white">
              {formatValue(total)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ol className="space-y-4" aria-label={title}>
          {items.map((item, index) => {
            const amount = Math.max(0, item.amount);
            const percentage = getPercentage(amount, positiveTotal);
            const tone = item.tone ?? "slate";

            return (
              <li key={item.label} className="min-w-0 space-y-2.5 rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-foreground dark:text-white">{item.label}</p>
                    {item.helper ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-slate-200/75">{item.helper}</p>
                    ) : null}
                  </div>
                  <div className="min-w-0 sm:shrink-0 sm:text-right">
                    <p className="break-words text-sm font-bold text-foreground dark:text-white">{formatValue(amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatPercentage(percentage)}</p>
                  </div>
                </div>

                <div
                  role="progressbar"
                  aria-label={`${item.label} : ${formatPercentage(percentage)}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percentage)}
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300", BAR_CLASSES[tone])}
                    style={{ width: `${Math.max(percentage > 0 ? 2 : 0, percentage)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        {positiveTotal <= 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Aucun mouvement dans cette catégorie pour la période sélectionnée.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
