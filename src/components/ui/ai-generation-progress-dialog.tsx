import { useMemo } from "react";
import { Check, Clock3, Image, Loader2, MessageSquareText, ScanSearch, Sparkles, Wand2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatWaitingTime, useEstimatedProgress } from "@/hooks/use-estimated-progress";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { cn } from "@/lib/utils";

type AiGenerationKind = "image" | "text" | "analysis";

type AiGenerationProgressDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  status?: string;
  steps?: string[];
  estimatedDurationMs?: number;
  kind?: AiGenerationKind;
  actualProgress?: number;
  completed?: boolean;
  dismissible?: boolean;
  backgroundSafe?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const DEFAULT_STEPS = ["Analyse", "Composition", "Finalisation"];
const ESTIMATED_DURATION_BY_KIND: Record<AiGenerationKind, number> = {
  image: 100_000,
  text: 18_000,
  analysis: 35_000,
};

const KIND_META = {
  image: { icon: Image, label: "Création visuelle" },
  text: { icon: MessageSquareText, label: "Réponse intelligente" },
  analysis: { icon: ScanSearch, label: "Analyse assistée" },
} satisfies Record<AiGenerationKind, { icon: typeof Image; label: string }>;

export default function AiGenerationProgressDialog({
  open,
  title,
  description = "TOK analyse votre demande, construit le résultat et effectue les dernières vérifications.",
  status = "Intelligence TOK au travail",
  steps = DEFAULT_STEPS,
  estimatedDurationMs,
  kind = "image",
  actualProgress,
  completed = false,
  dismissible = false,
  backgroundSafe = false,
  onOpenChange,
  className,
}: AiGenerationProgressDialogProps) {
  const logoSrc = useTokLogoSrc();
  const normalizedSteps = useMemo(() => (steps.length ? steps : DEFAULT_STEPS), [steps]);
  const durationMs = Math.max(1_000, estimatedDurationMs ?? ESTIMATED_DURATION_BY_KIND[kind]);
  const { elapsedMs, remainingMs, progress, isOverdue } = useEstimatedProgress({
    active: open,
    estimatedDurationMs: durationMs,
    actualProgress,
    completed,
    startPercent: 4,
    maxPercent: 96,
  });
  const progressRatio = Math.min(elapsedMs / durationMs, 0.999);
  const activeStepIndex = completed
    ? normalizedSteps.length
    : Math.min(normalizedSteps.length - 1, Math.floor(progressRatio * normalizedSteps.length));
  const KindIcon = KIND_META[kind].icon;

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
          "w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.8rem] border-orange-300/60 bg-[#090401] p-0 text-white shadow-[0_28px_110px_rgba(248,92,13,0.40)] sm:max-w-[680px]",
          className,
        )}
        data-testid="ai-generation-progress-dialog"
      >
        <style>{`
          @keyframes tokAiOrbit { to { transform: rotate(360deg); } }
          @keyframes tokAiOrbitReverse { to { transform: rotate(-360deg); } }
          @keyframes tokAiBreathe {
            0%, 100% { transform: scale(.96); filter: drop-shadow(0 0 15px rgba(255,125,32,.35)); }
            50% { transform: scale(1.04); filter: drop-shadow(0 0 30px rgba(255,177,80,.7)); }
          }
          @keyframes tokAiFloat {
            0%, 100% { transform: translate3d(0,0,0) rotate(-5deg); opacity: .62; }
            50% { transform: translate3d(0,-8px,0) rotate(7deg); opacity: 1; }
          }
          @keyframes tokAiSweep {
            0% { transform: translateX(-130%); opacity: 0; }
            25% { opacity: .8; }
            100% { transform: translateX(260%); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .tok-ai-motion { animation: none !important; transition: none !important; }
          }
        `}</style>

        <div className="relative isolate overflow-hidden px-5 pb-6 pt-6 sm:px-8 sm:pb-8">
          <div aria-hidden="true" className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_50%_10%,rgba(255,183,86,0.30),transparent_27%),radial-gradient(circle_at_8%_32%,rgba(255,100,20,0.28),transparent_35%),radial-gradient(circle_at_94%_60%,rgba(251,191,36,0.16),transparent_32%),linear-gradient(145deg,#1c0901_0%,#070201_52%,#160701_100%)]" />
          <div aria-hidden="true" className="absolute inset-0 -z-20 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
          <div aria-hidden="true" className="tok-ai-motion absolute -left-20 top-10 -z-10 h-56 w-56 animate-pulse rounded-full bg-orange-500/20 blur-3xl" />
          <div aria-hidden="true" className="tok-ai-motion absolute -right-20 bottom-0 -z-10 h-60 w-60 animate-pulse rounded-full bg-amber-300/10 blur-3xl [animation-delay:900ms]" />

          <div className="mx-auto flex max-w-[39rem] flex-col items-center text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200/25 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-100 backdrop-blur">
              <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {KIND_META[kind].label}
            </div>

            <div className="relative mb-5 grid h-36 w-36 place-items-center sm:h-40 sm:w-40">
              <div aria-hidden="true" className="tok-ai-motion absolute inset-0 rounded-full border border-orange-300/35 [animation:tokAiOrbit_7s_linear_infinite] before:absolute before:left-1/2 before:top-[-4px] before:h-2 before:w-2 before:-translate-x-1/2 before:rounded-full before:bg-amber-200 before:shadow-[0_0_16px_rgba(253,230,138,.95)]" />
              <div aria-hidden="true" className="tok-ai-motion absolute inset-3 rounded-full border border-dashed border-amber-100/35 [animation:tokAiOrbitReverse_10s_linear_infinite]" />
              <div aria-hidden="true" className="absolute inset-8 rounded-full bg-orange-500/25 blur-xl" />
              <div className="relative z-10 grid h-24 w-24 place-items-center overflow-hidden rounded-[2rem] border border-white/30 bg-white shadow-[0_16px_45px_rgba(0,0,0,.55),0_0_32px_rgba(255,124,24,.42)]">
                <img src={logoSrc} alt="" className="tok-ai-motion h-20 w-20 object-contain [animation:tokAiBreathe_3s_ease-in-out_infinite]" draggable={false} />
                <span aria-hidden="true" className="tok-ai-motion absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/70 to-transparent [animation:tokAiSweep_2.8s_ease-in-out_infinite]" />
              </div>
              <Sparkles aria-hidden="true" className="tok-ai-motion absolute right-0 top-6 h-5 w-5 text-amber-100 [animation:tokAiFloat_2.6s_ease-in-out_infinite]" />
              <Wand2 aria-hidden="true" className="tok-ai-motion absolute bottom-7 left-0 h-5 w-5 text-orange-100 [animation:tokAiFloat_3s_ease-in-out_.3s_infinite]" />
            </div>

            <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-orange-200/25 bg-orange-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-100">
              <span className="tok-ai-motion h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-400 shadow-[0_0_14px_rgba(251,146,60,.9)]" />
              <span className="truncate">{status}</span>
            </div>
            <DialogTitle className="font-display text-2xl leading-tight text-white sm:text-3xl">{title}</DialogTitle>
            <DialogDescription className="mt-3 max-w-lg text-sm leading-6 text-orange-50/75">{description}</DialogDescription>

            <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                <span className="font-bold text-white">{progress}%</span>
                <span className="flex items-center gap-1.5 text-right text-orange-50/65">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {completed
                    ? "Résultat prêt"
                    : isOverdue
                      ? "Finalisation en cours…"
                      : `Environ ${formatWaitingTime(remainingMs)} restante${remainingMs >= 2_000 ? "s" : ""}`}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-black/45 shadow-inner"
                role="progressbar"
                aria-label={title}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="relative h-full rounded-full bg-gradient-to-r from-orange-600 via-amber-300 to-orange-400 shadow-[0_0_22px_rgba(251,146,60,.78)] transition-[width] duration-500 ease-out"
                  data-testid="ai-generation-progress-fill"
                  style={{ width: `${progress}%` }}
                >
                  <span aria-hidden="true" className="tok-ai-motion absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent [animation:tokAiSweep_1.9s_ease-in-out_infinite]" />
                </div>
              </div>

              <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Étapes de génération">
                {normalizedSteps.map((step, index) => {
                  const done = completed || index < activeStepIndex;
                  const active = !completed && index === activeStepIndex;
                  return (
                    <li
                      key={`${index}-${step}`}
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-[11px] transition-colors",
                        done && "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
                        active && "border-orange-300/40 bg-orange-400/15 font-semibold text-white",
                        !done && !active && "border-white/[0.08] bg-black/15 text-orange-50/45",
                      )}
                    >
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", done ? "bg-emerald-500 text-white" : active ? "bg-orange-500 text-white" : "bg-white/10 text-orange-50/45")}>
                        {done ? <Check className="h-3 w-3" aria-hidden="true" /> : active ? <Loader2 className="tok-ai-motion h-3 w-3 animate-spin" aria-hidden="true" /> : index + 1}
                      </span>
                      <span className="truncate">{step}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <p className="mt-4 max-w-lg text-[11px] leading-5 text-orange-50/55">
              Temps écoulé : {formatWaitingTime(elapsedMs)}. {isOverdue
                ? "Le délai estimé est dépassé, mais la génération continue normalement. La complexité du visuel et la file IA peuvent faire varier la durée."
                : backgroundSafe && dismissible
                  ? "Vous pouvez fermer cette fenêtre : cette génération est suivie côté serveur."
                  : "Gardez cette fenêtre ouverte jusqu’à la réception du résultat. La durée affichée reste une estimation."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
