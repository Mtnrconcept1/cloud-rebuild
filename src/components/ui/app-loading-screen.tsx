import { Loader2 } from "lucide-react";

import { useEstimatedProgress } from "@/hooks/use-estimated-progress";
import TokSaturnLoader from "@/components/ui/tok-saturn-loader";
import { cn } from "@/lib/utils";

type AppLoadingScreenProps = {
  title?: string;
  description?: string;
  fullScreen?: boolean;
  className?: string;
};

export default function AppLoadingScreen({
  title = "TOK prépare votre espace",
  description = "Chargement des outils et synchronisation de vos données…",
  fullScreen = false,
  className,
}: AppLoadingScreenProps) {
  const { progress, isOverdue } = useEstimatedProgress({
    active: true,
    estimatedDurationMs: 2_800,
    startPercent: 8,
    maxPercent: 94,
  });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "relative isolate grid w-full place-items-center overflow-hidden bg-background px-5 py-12",
        fullScreen ? "min-h-dvh" : "min-h-[55dvh]",
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_38%,rgba(249,115,22,0.16),transparent_28%),radial-gradient(circle_at_20%_15%,rgba(251,191,36,0.09),transparent_25%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/.3))]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-35 [background-image:linear-gradient(rgba(249,115,22,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,.055)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />

      <div className="w-full max-w-sm text-center">
        <TokSaturnLoader size="lg" className="mb-4 max-w-[275px]" />

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/35 dark:text-orange-200">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {isOverdue ? "Synchronisation finale" : "Chargement intelligent"}
        </div>
        <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>

        <div className="mx-auto mt-6 max-w-xs">
          <div className="mb-2 flex justify-between text-[10px] font-semibold text-muted-foreground">
            <span>Préparation</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-muted shadow-inner"
          >
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-orange-600 via-orange-400 to-amber-300 shadow-[0_0_18px_rgba(249,115,22,.35)] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            >
              <span aria-hidden="true" className="absolute inset-y-0 right-0 w-10 animate-pulse bg-gradient-to-r from-transparent to-white/70 motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
