import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type AiLoadingStateProps = {
  title: string;
  description?: string;
  steps?: string[];
  compact?: boolean;
  className?: string;
};

export function AiLoadingState({
  title,
  description,
  steps = [],
  compact = false,
  className,
}: AiLoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/15 bg-background/95 shadow-sm",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_0%,rgba(255,106,26,0.10)_35%,rgba(14,165,233,0.08)_55%,transparent_75%)]"
      />
      <div aria-hidden="true" className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-sky-400/10 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-orange-500/10 blur-2xl" />

      <div className="relative flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
          {steps.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {steps.map((step, index) => (
                <span
                  key={step}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    style={{ animationDelay: `${index * 160}ms` }}
                  />
                  {step}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
