import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  Check,
  CloudUpload,
  CreditCard,
  Loader2,
  RefreshCw,
  Save,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatWaitingTime, useEstimatedProgress } from "@/hooks/use-estimated-progress";
import { cn } from "@/lib/utils";

type OperationVariant = "default" | "save" | "upload" | "payment" | "reservation" | "analysis" | "security";

type OperationProgressDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  status?: string;
  steps?: string[];
  estimatedDurationMs?: number;
  variant?: OperationVariant;
  actualProgress?: number;
  completed?: boolean;
  dismissible?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const VARIANT_ICONS: Record<OperationVariant, LucideIcon> = {
  default: RefreshCw,
  save: Save,
  upload: CloudUpload,
  payment: CreditCard,
  reservation: CalendarCheck2,
  analysis: ScanSearch,
  security: ShieldCheck,
};

const DEFAULT_STEPS = ["Préparation", "Traitement", "Confirmation"];

export default function OperationProgressDialog({
  open,
  title,
  description = "TOK termine l’opération et vérifie que toutes les données ont bien été enregistrées.",
  status = "Traitement sécurisé en cours",
  steps = DEFAULT_STEPS,
  estimatedDurationMs = 8_000,
  variant = "default",
  actualProgress,
  completed = false,
  dismissible = false,
  onOpenChange,
  className,
}: OperationProgressDialogProps) {
  const normalizedSteps = steps.length ? steps : DEFAULT_STEPS;
  const { elapsedMs, remainingMs, progress, isOverdue } = useEstimatedProgress({
    active: open,
    estimatedDurationMs,
    actualProgress,
    completed,
    startPercent: 6,
    maxPercent: 95,
  });
  const stepRatio = Math.min(elapsedMs / Math.max(estimatedDurationMs, 1), 0.999);
  const activeStepIndex = completed
    ? normalizedSteps.length
    : Math.min(normalizedSteps.length - 1, Math.floor(stepRatio * normalizedSteps.length));
  const Icon = VARIANT_ICONS[variant];

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !dismissible && open) return;
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={!dismissible}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        className={cn(
          "w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.65rem] border-orange-200/70 bg-background p-0 shadow-[0_26px_90px_rgba(44,21,8,0.28)] sm:max-w-[560px]",
          className,
        )}
        data-testid="operation-progress-dialog"
      >
        <div className="relative isolate overflow-hidden px-5 pb-6 pt-7 sm:px-7">
          <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_12%_0%,rgba(249,115,22,0.18),transparent_38%),radial-gradient(circle_at_92%_18%,rgba(251,191,36,0.13),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/.42))]" />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-orange-400/80 to-transparent" />

          <div className="flex items-start gap-4">
            <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-[0_12px_35px_rgba(249,115,22,0.32)]">
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-2xl border border-orange-400/40 motion-reduce:animate-none" />
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-800 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-200">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="truncate">{status}</span>
              </div>
              <DialogTitle className="text-xl leading-tight sm:text-2xl">{title}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6">{description}</DialogDescription>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-foreground">{progress}%</span>
              <span className="text-right text-muted-foreground">
                {completed
                  ? "Terminé"
                  : isOverdue
                    ? "Vérification finale…"
                    : `Encore environ ${formatWaitingTime(remainingMs)}`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-2.5 overflow-hidden rounded-full bg-muted shadow-inner"
            >
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-orange-600 via-orange-400 to-amber-300 shadow-[0_0_18px_rgba(249,115,22,0.42)] transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
                data-testid="operation-progress-fill"
              >
                <span aria-hidden="true" className="absolute inset-y-0 right-0 w-12 animate-pulse bg-gradient-to-r from-transparent to-white/70 motion-reduce:animate-none" />
              </div>
            </div>
          </div>

          <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Étapes de l’opération">
            {normalizedSteps.map((step, index) => {
              const done = completed || index < activeStepIndex;
              const active = !completed && index === activeStepIndex;
              return (
                <li
                  key={`${index}-${step}`}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors",
                    done && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
                    active && "border-orange-300 bg-orange-50 font-semibold text-orange-950 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-100",
                    !done && !active && "border-border/60 bg-muted/25 text-muted-foreground",
                  )}
                >
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", done ? "bg-emerald-600 text-white" : active ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="h-3 w-3" aria-hidden="true" /> : active ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="truncate">{step}</span>
                </li>
              );
            })}
          </ol>

          <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">
            Temps écoulé : {formatWaitingTime(elapsedMs)}. Ne fermez pas l’application pendant cette étape.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
