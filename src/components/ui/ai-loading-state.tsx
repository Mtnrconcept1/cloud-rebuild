import { Check, Loader2, Sparkles } from "lucide-react";

import { formatWaitingTime, useEstimatedProgress } from "@/hooks/use-estimated-progress";
import { cn } from "@/lib/utils";

type AiLoadingStateProps = {
  title: string;
  description?: string;
  steps?: string[];
  compact?: boolean;
  active?: boolean;
  estimatedDurationMs?: number;
  actualProgress?: number;
  className?: string;
};

export function AiLoadingState({
  title,
  description,
  steps = [],
  compact = false,
  active = true,
  estimatedDurationMs = 18_000,
  actualProgress,
  className,
}: AiLoadingStateProps) {
  const { elapsedMs, remainingMs, progress, isOverdue } = useEstimatedProgress({
    active,
    estimatedDurationMs,
    actualProgress,
    startPercent: 5,
    maxPercent: 94,
  });
  const activeStepIndex = steps.length
    ? Math.min(steps.length - 1, Math.floor(Math.min(elapsedMs / Math.max(estimatedDurationMs, 1), 0.999) * steps.length))
    : 0;

  return (
    <div
      role="status"
      aria-busy={active}
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/15 bg-background/95 shadow-[0_12px_36px_rgba(15,23,42,0.08)]",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(255,106,26,0.12),transparent_38%),radial-gradient(circle_at_100%_100%,rgba(14,165,233,0.08),transparent_36%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />

      <div className="relative flex items-start gap-3">
        <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
          <span aria-hidden="true" className="absolute inset-1 animate-ping rounded-lg border border-primary/20 motion-reduce:animate-none" />
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-medium text-muted-foreground">
              <span>{progress}%</span>
              <span>{isOverdue ? "Finalisation…" : `≈ ${formatWaitingTime(remainingMs)}`}</span>
            </div>
            <div
              role="progressbar"
              aria-label={title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-full bg-muted shadow-inner"
            >
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-primary via-orange-400 to-amber-300 transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              >
                <span aria-hidden="true" className="absolute inset-y-0 right-0 w-8 animate-pulse bg-gradient-to-r from-transparent to-white/70 motion-reduce:animate-none" />
              </div>
            </div>
          </div>

          {steps.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {steps.map((step, index) => {
                const done = index < activeStepIndex;
                const current = index === activeStepIndex;
                return (
                  <span
                    key={`${index}-${step}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      done && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
                      current && "border-primary/30 bg-primary/10 text-foreground",
                      !done && !current && "border-border/60 bg-background/60 text-muted-foreground/60",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" aria-hidden="true" /> : (
                      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", current ? "animate-pulse bg-primary motion-reduce:animate-none" : "bg-muted-foreground/35")} />
                    )}
                    {step}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
