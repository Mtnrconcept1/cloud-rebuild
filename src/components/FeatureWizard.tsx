import { ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface WizardStep { id: string; label: string; }
export interface FeatureWizardProps { title: string; subtitle: string; icon: React.ElementType; colorClass: string; steps: WizardStep[]; currentStepId: string; onStepChange?: (stepId: string) => void; headerAction?: React.ReactNode; children: ReactNode; }

export function FeatureWizard({ title, subtitle, icon: Icon, colorClass, steps, currentStepId, onStepChange, headerAction, children }: FeatureWizardProps) {
  const currentIdx = steps.findIndex((s) => s.id === currentStepId);
  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl bg-${colorClass}/10 flex items-center justify-center shrink-0`}><Icon className={`h-6 w-6 text-${colorClass}`} /></div>
            <div><h1 className="font-display text-2xl font-bold">{title}</h1><p className="text-muted-foreground text-sm">{subtitle}</p></div>
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0">
          {steps.map((s, i) => {
            const isCurrent = s.id === currentStepId;
            const isPast = i < currentIdx;
            return (
              <div key={s.id} className="flex items-center gap-1 flex-1 min-w-fit">
                <button onClick={() => isPast && onStepChange && onStepChange(s.id)} disabled={!isPast && !isCurrent} className={`flex items-center gap-2 transition-colors ${isPast ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? `bg-${colorClass} text-white` : isPast ? `bg-${colorClass}/20 text-${colorClass}` : "bg-secondary text-muted-foreground"}`}>{isPast ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</div>
                  <span className={`text-[11px] whitespace-nowrap ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"} ${!isCurrent && !isPast ? "hidden sm:inline" : ""}`}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className="flex-1 min-w-[1rem] h-0.5 bg-secondary rounded mx-1" />}
              </div>
            );
          })}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

export function WizardBackButton({ onClick, label = "Retour" }: { onClick: () => void; label?: string }) {
  return <Button variant="ghost" size="sm" onClick={onClick} className="gap-1 mb-4"><ChevronLeft className="h-4 w-4" /> {label}</Button>;
}

export function WizardNextButton({ onClick, label = "Continuer", colorClass = "primary" }: { onClick: () => void; label?: string; colorClass?: string }) {
  return <Button onClick={onClick} className={`w-full bg-${colorClass} hover:opacity-90 transition-opacity gap-2`}>{label} <ChevronRight className="h-4 w-4" /></Button>;
}

export function WizardCartSummary({ count, subtotal, colorClass = "primary", feeLabel, feeAmount, total, onValidate, validateLabel = "Valider" }: { count: number; subtotal: number; colorClass?: string; feeLabel?: string; feeAmount?: number; total: number; onValidate: () => void; validateLabel?: string }) {
  if (count === 0) return null;
  return (
    <div className={`sticky bottom-4 rounded-xl border-2 border-${colorClass}/20 bg-${colorClass}/5 p-4 shadow-lg space-y-2 mt-8 animate-in slide-in-from-bottom-4`}>
      <div className="flex justify-between text-sm"><span>{count} article{count > 1 ? "s" : ""}</span><span className="font-bold">{subtotal.toFixed(2)} CHF</span></div>
      {(feeLabel && feeAmount !== undefined && feeAmount > 0) && <div className={`flex justify-between text-xs text-${colorClass}`}><span>{feeLabel}</span><span>+{feeAmount.toFixed(2)} CHF</span></div>}
      <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>Total</span><span>{total.toFixed(2)} CHF</span></div>
      <Button onClick={onValidate} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 mt-2"><ShoppingCart className="h-4 w-4" /> {validateLabel}</Button>
    </div>
  );
}
