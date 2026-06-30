import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { cn } from "@/lib/utils";

type AiGenerationProgressDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  status?: string;
  steps?: string[];
  className?: string;
};

const DEFAULT_STEPS = ["Analyse", "Composition", "Export"];

export default function AiGenerationProgressDialog({
  open,
  title,
  description = "TOK prepare le rendu, verifie les ressources et finalise un visuel pret a publier.",
  status = "Creation en cours",
  steps = DEFAULT_STEPS,
  className,
}: AiGenerationProgressDialogProps) {
  const logoSrc = useTokLogoSrc();
  const [dismissed, setDismissed] = useState(false);
  const normalizedSteps = useMemo(() => (steps.length ? steps : DEFAULT_STEPS), [steps]);

  useEffect(() => {
    if (open) {
      setDismissed(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open && !dismissed}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDismissed(true);
        }
      }}
    >
      <DialogContent
        className={cn(
          "w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.7rem] border-orange-300/70 bg-[#090401] p-0 text-white shadow-[0_24px_90px_rgba(248,92,13,0.42)] sm:max-w-[690px]",
          className,
        )}
        data-testid="ai-generation-progress-dialog"
      >
        <style>{`
          @keyframes tokAiModalGlow {
            0%, 100% { opacity: 0.68; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1.04); }
          }
          @keyframes tokAiModalOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes tokAiModalOrbitReverse {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
          @keyframes tokAiModalPulse {
            0%, 100% { transform: scale(0.98); filter: drop-shadow(0 0 18px rgba(255, 111, 24, 0.34)); }
            50% { transform: scale(1.05); filter: drop-shadow(0 0 34px rgba(255, 170, 64, 0.62)); }
          }
          @keyframes tokAiModalStage {
            0%, 100% { opacity: 0.72; transform: scaleX(0.92); }
            50% { opacity: 1; transform: scaleX(1.08); }
          }
          @keyframes tokAiModalFloat {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0.72; }
            50% { transform: translate3d(0, -8px, 0) rotate(8deg); opacity: 1; }
          }
          @keyframes tokAiModalScan {
            0% { transform: translateY(-120%); opacity: 0; }
            18% { opacity: 0.85; }
            64% { opacity: 0.42; }
            100% { transform: translateY(120%); opacity: 0; }
          }
          @keyframes tokAiModalProgress {
            0% { transform: translateX(-78%) scaleX(0.34); }
            45% { transform: translateX(-8%) scaleX(0.72); }
            100% { transform: translateX(86%) scaleX(0.42); }
          }
          @keyframes tokAiModalStep {
            0%, 100% { opacity: 0.52; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-2px); }
          }
          @keyframes tokAiModalMarquee {
            0%, 12% { transform: translateX(0); }
            88%, 100% { transform: translateX(calc(-100% + min(100%, 18rem))); }
          }
          @media (prefers-reduced-motion: reduce) {
            .tok-ai-modal-motion {
              animation: none !important;
              transition: none !important;
            }
          }
        `}</style>
        <div className="relative isolate overflow-hidden px-5 pb-5 pt-6 sm:px-8 sm:pb-8">
          <div className="tok-ai-modal-motion absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_22%,rgba(255,177,77,0.36),transparent_28%),radial-gradient(circle_at_17%_18%,rgba(255,137,42,0.42),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(255,214,128,0.22),transparent_28%),linear-gradient(135deg,#160700_0%,#050201_50%,#1f0b01_100%)]" />
          <div className="absolute inset-x-0 top-0 -z-10 h-44 bg-[linear-gradient(180deg,rgba(255,157,67,0.18),transparent)]" />
          <div className="tok-ai-modal-motion absolute -left-16 top-12 -z-10 h-52 w-52 rounded-full bg-orange-500/32 blur-3xl [animation:tokAiModalGlow_4.8s_ease-in-out_infinite]" />
          <div className="tok-ai-modal-motion absolute -right-10 bottom-3 -z-10 h-52 w-52 rounded-full bg-amber-300/22 blur-3xl [animation:tokAiModalGlow_5.4s_ease-in-out_infinite_reverse]" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] opacity-30" />

          <div className="mx-auto flex max-w-[38rem] flex-col items-center text-center">
            <div className="relative mb-7 flex h-56 w-full items-center justify-center overflow-visible">
              <div className="absolute bottom-7 h-5 w-60 rounded-[50%] bg-amber-300/80 blur-xl shadow-[0_0_70px_rgba(251,146,60,0.82)]" />
              <div className="tok-ai-modal-motion absolute bottom-5 h-6 w-52 rounded-[50%] border border-orange-200/50 bg-[radial-gradient(ellipse_at_center,rgba(255,223,159,0.95),rgba(255,117,24,0.34)_48%,transparent_74%)] [animation:tokAiModalStage_2.8s_ease-in-out_infinite]" />
              <div className="absolute bottom-11 h-28 w-56 bg-[radial-gradient(ellipse_at_bottom,rgba(255,164,72,0.38),transparent_67%)] blur-md" />
              <div className="tok-ai-modal-motion absolute h-44 w-44 rounded-full border border-orange-300/42 [animation:tokAiModalOrbit_6s_linear_infinite]" />
              <div className="tok-ai-modal-motion absolute h-36 w-36 rounded-full border border-dashed border-amber-200/50 [animation:tokAiModalOrbitReverse_9s_linear_infinite]" />
              <div className="tok-ai-modal-motion absolute h-28 w-28 rounded-full bg-orange-500/18 blur-xl [animation:tokAiModalGlow_3.8s_ease-in-out_infinite]" />
              <div className="relative z-10 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/95 shadow-[0_18px_45px_rgba(0,0,0,0.5),0_0_38px_rgba(255,124,24,0.45)]">
                <img src={logoSrc} alt="" className="tok-ai-modal-motion h-24 w-24 object-contain [animation:tokAiModalPulse_2.8s_ease-in-out_infinite]" draggable={false} />
                <span className="tok-ai-modal-motion pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/70 to-transparent [animation:tokAiModalScan_2.9s_ease-in-out_infinite]" />
              </div>
              <Sparkles className="tok-ai-modal-motion absolute right-20 top-12 h-6 w-6 text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.95)] [animation:tokAiModalFloat_2.4s_ease-in-out_infinite]" />
              <Wand2 className="tok-ai-modal-motion absolute bottom-20 left-20 h-6 w-6 text-orange-100 drop-shadow-[0_0_18px_rgba(251,146,60,0.9)] [animation:tokAiModalFloat_2.8s_ease-in-out_infinite_.2s]" />
              <span className="tok-ai-modal-motion absolute left-8 top-20 h-1.5 w-1.5 rounded-full bg-amber-100 shadow-[0_0_18px_rgba(253,230,138,0.9)] [animation:tokAiModalFloat_3s_ease-in-out_infinite]" />
              <span className="tok-ai-modal-motion absolute right-8 bottom-24 h-1.5 w-1.5 rounded-full bg-orange-200 shadow-[0_0_18px_rgba(251,146,60,0.9)] [animation:tokAiModalFloat_3.4s_ease-in-out_infinite_.3s]" />
            </div>

            <div className="mb-3 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-orange-200/30 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.26em] text-orange-100">
              <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 shadow-[0_0_16px_rgba(251,146,60,0.9)]" />
              <span className="tok-ai-modal-motion inline-block min-w-max [animation:tokAiModalMarquee_8s_linear_infinite]">{status}</span>
            </div>

            <DialogTitle className="font-display text-2xl leading-tight text-white sm:text-3xl">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-3 max-w-sm text-sm leading-6 text-orange-50/78">
              {description}
            </DialogDescription>

            <div className="mt-6 w-full overflow-hidden rounded-full border border-white/10 bg-white/10 p-1 shadow-inner shadow-black/60">
              <div className="relative h-2 overflow-hidden rounded-full bg-black/40">
                <span className="tok-ai-modal-motion absolute inset-y-0 left-0 w-2/3 rounded-full bg-gradient-to-r from-orange-500 via-amber-200 to-orange-500 shadow-[0_0_24px_rgba(251,146,60,0.95)] [animation:tokAiModalProgress_2.6s_ease-in-out_infinite]" />
              </div>
            </div>

            <div className="mt-5 grid w-full gap-3">
              {normalizedSteps.map((step, index) => (
                <div
                  key={step}
                  className="rounded-[1.35rem] border border-white/10 bg-white/[0.08] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.22)]"
                >
                  <span
                    className="tok-ai-modal-motion mb-2 block h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_14px_rgba(253,186,116,0.85)]"
                    style={{ animation: `tokAiModalStep 1.8s ease-in-out ${index * 0.18}s infinite` }}
                  />
                  <p className="text-xs font-semibold leading-4 text-white">{step}</p>
                </div>
              ))}
            </div>

            <p className="mt-5 max-w-sm text-xs leading-5 text-orange-50/62">
              Vous pouvez fermer cette fenetre: la creation continue en arriere-plan lorsque l'outil conserve la generation cote serveur.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
