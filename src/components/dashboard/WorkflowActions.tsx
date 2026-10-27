import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One action area stays reachable throughout a long workflow step. */
export default function WorkflowActions({ step, total, title, hint, onBack, disabled, children }: {
  step: number;
  total: number;
  title: string;
  hint?: string;
  onBack?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <footer className="tok-workflow-actions" role="group" aria-label="Actions de l’étape">
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <p className="text-xs font-semibold text-muted-foreground">Étape {step} sur {total}</p>
        <p className="font-semibold text-foreground">{title}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {onBack ? <Button type="button" variant="outline" onClick={onBack} disabled={disabled} className="min-h-11 gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Retour
        </Button> : null}
        {children}
      </div>
    </footer>
  );
}
