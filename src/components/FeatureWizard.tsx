import { ReactNode } from "react";
import {
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Crown,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface WizardStep { id: string; label: string; }
export interface FeatureWizardProps { title: string; subtitle: string; icon: React.ElementType; colorClass: string; steps: WizardStep[]; currentStepId: string; onStepChange?: (stepId: string) => void; headerAction?: React.ReactNode; children: ReactNode; }

const GOLDEN_TOK_LOGO = "/Image%20Codex%203%20sept.%202026,%2002_31_12.png";

const GOLDEN_TOK_BENEFITS = [
  {
    title: "Créations exclusives",
    description: "Off-menu & ultra-limitées",
    icon: ChefHat,
  },
  {
    title: "Chefs partenaires",
    description: "Talents sélectionnés",
    icon: Crown,
  },
  {
    title: "Expérience premium",
    description: "Réservée aux gourmets",
    icon: Sparkles,
  },
  {
    title: "Paiement sécurisé",
    description: "Transaction 100% sûre",
    icon: ShieldCheck,
  },
] as const;

const GOLDEN_TOK_SCOPED_STYLES = `
[data-golden-tok-chefs-table] .golden-tok-content > div > div:first-child {
  background: linear-gradient(115deg, #121212 0%, #1d1b17 58%, #111 100%);
  border-color: rgba(207, 164, 69, 0.78) !important;
  color: #f7ecd1;
  box-shadow: 0 18px 45px -28px rgba(87, 58, 4, 0.72), inset 0 1px 0 rgba(255,255,255,0.05);
}

[data-golden-tok-chefs-table] .golden-tok-content > div > div:first-child > div:first-child {
  background: #d6aa45 !important;
  box-shadow: 0 0 0 5px rgba(214, 170, 69, 0.12), 0 0 18px rgba(214, 170, 69, 0.42);
}

[data-golden-tok-chefs-table] .golden-tok-content > div > div:first-child span {
  color: #e6c66d !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > div > div:first-child .ml-auto {
  border-color: rgba(230, 198, 109, 0.62) !important;
  background: rgba(0, 0, 0, 0.2) !important;
  color: #f0d684 !important;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] {
  position: relative;
  overflow: hidden;
  border-style: solid !important;
  border-color: rgba(201, 151, 46, 0.72) !important;
  background-color: #fbf8f1 !important;
  background-image:
    linear-gradient(45deg, rgba(178, 132, 41, 0.045) 25%, transparent 25%, transparent 75%, rgba(178, 132, 41, 0.045) 75%),
    linear-gradient(45deg, rgba(178, 132, 41, 0.045) 25%, transparent 25%, transparent 75%, rgba(178, 132, 41, 0.045) 75%);
  background-position: 0 0, 14px 14px;
  background-size: 28px 28px;
  box-shadow: 0 26px 65px -45px rgba(65, 44, 6, 0.7), inset 0 1px 0 rgba(255,255,255,0.9);
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"]::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 4%, rgba(220, 173, 70, 0.18), transparent 34%);
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"]::after {
  content: "★  ★  ★";
  display: block;
  position: relative;
  margin-top: 18px;
  color: #c9952f;
  font-size: 16px;
  letter-spacing: 0.18em;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] > svg {
  position: relative;
  z-index: 1;
  width: 72px !important;
  height: 72px !important;
  padding: 18px;
  border: 1px solid rgba(220, 176, 77, 0.9);
  border-radius: 9999px;
  background: #141414;
  color: #dfb750 !important;
  box-shadow: 0 13px 35px -18px rgba(0,0,0,0.7), 0 0 0 7px rgba(213, 168, 68, 0.08);
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] h2 {
  position: relative;
  z-index: 1;
  color: #17130c;
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -0.025em;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] p {
  position: relative;
  z-index: 1;
  color: #756b5c;
}

[data-golden-tok-chefs-table] .golden-tok-header-action button {
  min-height: 46px;
  border: 1px solid rgba(217, 176, 80, 0.82) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, #1d1d1b 0%, #111 100%) !important;
  color: #f0d47d !important;
  box-shadow: 0 15px 34px -23px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.07);
}

[data-golden-tok-chefs-table] .golden-tok-header-action button:hover {
  background: linear-gradient(180deg, #29261f 0%, #171511 100%) !important;
  color: #ffe6a0 !important;
}

.dark [data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] {
  border-color: rgba(219, 177, 83, 0.38) !important;
  background-color: #141310 !important;
  background-image:
    linear-gradient(45deg, rgba(224, 184, 94, 0.04) 25%, transparent 25%, transparent 75%, rgba(224, 184, 94, 0.04) 75%),
    linear-gradient(45deg, rgba(224, 184, 94, 0.04) 25%, transparent 25%, transparent 75%, rgba(224, 184, 94, 0.04) 75%);
}

.dark [data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] h2 {
  color: #faf3e2;
}

.dark [data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] p {
  color: #b8ad9a;
}
`;

function GoldenTokFeatureWizard({
  title,
  subtitle,
  steps,
  currentStepId,
  onStepChange,
  headerAction,
  children,
}: Omit<FeatureWizardProps, "icon" | "colorClass">) {
  const currentIdx = steps.findIndex((step) => step.id === currentStepId);
  const normalizedCurrentIdx = Math.max(0, currentIdx);

  return (
    <main
      data-golden-tok-chefs-table
      className="relative min-h-screen overflow-hidden bg-[#f8f4ec] text-[#17130d] dark:bg-[#0b0b0a] dark:text-[#f7f0df]"
    >
      <style>{GOLDEN_TOK_SCOPED_STYLES}</style>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_4%,rgba(214,170,69,0.17),transparent_28%),radial-gradient(circle_at_16%_55%,rgba(214,170,69,0.08),transparent_34%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d8ae4f] to-transparent" />

      <div className="relative mx-auto grid w-full max-w-7xl gap-7 px-4 py-7 sm:px-6 sm:py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:py-12">
        <aside className="flex flex-col items-center lg:sticky lg:top-28 lg:self-start">
          <div className="relative w-full max-w-[205px] sm:max-w-[225px]">
            <div aria-hidden="true" className="absolute inset-[13%] rounded-full bg-[#d8ae4f]/20 blur-2xl" />
            <img
              src={GOLDEN_TOK_LOGO}
              alt="Golden TOK"
              className="relative h-auto w-full select-none object-contain drop-shadow-[0_22px_28px_rgba(66,45,4,0.23)]"
              draggable={false}
              loading="eager"
            />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.34em] text-[#a97920] dark:text-[#e1bd63]">
            <span className="h-px w-7 bg-current/50" />
            Édition signature
            <span className="h-px w-7 bg-current/50" />
          </div>
        </aside>

        <section className="min-w-0">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mb-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#d8ae4f]/45 bg-white/75 px-4 text-sm font-medium text-[#875d13] shadow-[0_12px_28px_-22px_rgba(55,34,0,0.7)] transition hover:border-[#c99731] hover:bg-white dark:bg-white/5 dark:text-[#e9ca7a]"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </button>

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#d8ae4f]/75 bg-[#151515] text-[#e0ba5a] shadow-[0_14px_32px_-20px_rgba(0,0,0,0.78),0_0_0_6px_rgba(216,174,79,0.07)] sm:h-16 sm:w-16">
                <ChefHat className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#a97920] dark:text-[#dbb85f]">
                  Golden TOK
                </p>
                <h1 className="font-display text-3xl font-bold tracking-[-0.035em] text-[#17130d] dark:text-[#fff8e8] sm:text-4xl lg:text-[42px] lg:leading-none">
                  {title}
                </h1>
                <p className="mt-2 text-sm text-[#756b5c] dark:text-[#b9ad98] sm:text-base">
                  {subtitle}
                </p>
              </div>
            </div>

            {headerAction ? (
              <div className="golden-tok-header-action shrink-0 md:pl-4">{headerAction}</div>
            ) : null}
          </div>

          <div className="mt-8 rounded-[22px] border border-[#d8ae4f]/25 bg-white/45 px-4 py-3 shadow-[0_18px_45px_-38px_rgba(77,48,0,0.45)] backdrop-blur-sm dark:bg-white/[0.035] sm:px-5">
            <div className="flex items-center">
              {steps.map((step, index) => {
                const isCurrent = step.id === currentStepId;
                const isPast = index < normalizedCurrentIdx;

                return (
                  <div key={step.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => isPast && onStepChange?.(step.id)}
                      disabled={!isPast && !isCurrent}
                      className={`group flex min-h-[44px] shrink-0 items-center gap-2 rounded-full pr-3 text-left text-sm transition ${
                        isPast ? "cursor-pointer hover:opacity-80" : "cursor-default"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition sm:h-9 sm:w-9 ${
                          isCurrent
                            ? "border-[#d5a83f] bg-gradient-to-br from-[#e2bd61] to-[#b47c1b] text-[#15120c] shadow-[0_7px_18px_-8px_rgba(151,102,17,0.9)]"
                            : isPast
                              ? "border-[#d8ae4f]/45 bg-[#d8ae4f]/12 text-[#a97920] dark:text-[#e7c96f]"
                              : "border-black/10 bg-black/[0.035] text-[#777064] dark:border-white/10 dark:bg-white/5 dark:text-white/50"
                        }`}
                      >
                        {isPast ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className={isCurrent ? "font-semibold text-[#17130d] dark:text-[#fff7e3]" : "text-[#7e7568] dark:text-white/55"}>
                        {step.label}
                      </span>
                    </button>

                    {index < steps.length - 1 ? (
                      <div className="mx-2 h-px min-w-5 flex-1 bg-gradient-to-r from-[#c89126]/80 to-black/10 dark:to-white/10 sm:mx-4" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="golden-tok-content mt-6">{children}</div>

          <div className="mt-8 overflow-hidden rounded-[26px] border border-[#d8ae4f]/55 bg-[linear-gradient(115deg,#111_0%,#1d1b17_55%,#111_100%)] text-[#f7ecd1] shadow-[0_24px_70px_-42px_rgba(0,0,0,0.88)]">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              {GOLDEN_TOK_BENEFITS.map(({ title: benefitTitle, description, icon: BenefitIcon }, index) => (
                <div
                  key={benefitTitle}
                  className={`flex items-center gap-3 px-5 py-5 ${
                    index > 0 ? "border-t border-[#d8ae4f]/20 sm:border-t-0" : ""
                  } ${index % 2 === 1 ? "sm:border-l sm:border-[#d8ae4f]/20" : ""} ${
                    index >= 2 ? "xl:border-l xl:border-[#d8ae4f]/20" : ""
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8ae4f]/60 bg-[#d8ae4f]/[0.07] text-[#e0b955]">
                    <BenefitIcon className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#f0d47d]">{benefitTitle}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-white/58">{description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function FeatureWizard({ title, subtitle, icon: Icon, colorClass, steps, currentStepId, onStepChange, headerAction, children }: FeatureWizardProps) {
  if (title === "La Table du Chef") {
    return (
      <GoldenTokFeatureWizard
        title={title}
        subtitle={subtitle}
        steps={steps}
        currentStepId={currentStepId}
        onStepChange={onStepChange}
        headerAction={headerAction}
      >
        {children}
      </GoldenTokFeatureWizard>
    );
  }

  const currentIdx = steps.findIndex((s) => s.id === currentStepId);
  const currentStep = steps[Math.max(0, currentIdx)] ?? steps[0];
  const progress = steps.length > 0 ? Math.round(((Math.max(0, currentIdx) + 1) / steps.length) * 100) : 0;
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
        <div className="space-y-3 rounded-xl border bg-card/80 p-2 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Etape {Math.max(0, currentIdx) + 1} sur {steps.length}
              </p>
              <p className="truncate text-sm font-semibold">{currentStep?.label}</p>
            </div>
            <Badge variant="secondary" className="shrink-0">{progress}%</Badge>
          </div>
          <div className="flex items-center gap-1" aria-label="Progression">
            {steps.map((s, i) => {
              const isCurrent = s.id === currentStepId;
              const isPast = i < currentIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Etape ${i + 1}: ${s.label}`}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => isPast && onStepChange && onStepChange(s.id)}
                  disabled={!isPast && !isCurrent}
                  className={`flex h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-full text-xs font-bold transition-colors ${isCurrent
                    ? `bg-${colorClass} text-white`
                    : isPast
                      ? `bg-${colorClass}/20 text-${colorClass}`
                      : "bg-secondary text-muted-foreground"
                    } ${isPast ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                >
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </button>
              );
            })}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full bg-${colorClass} transition-all`} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="hidden items-center gap-1 overflow-x-auto pb-2 sm:flex sm:pb-0">
          {steps.map((s, i) => {
            const isCurrent = s.id === currentStepId;
            const isPast = i < currentIdx;
            return (
              <div key={s.id} className="flex items-center gap-1 flex-1 min-w-fit">
                <button onClick={() => isPast && onStepChange && onStepChange(s.id)} disabled={!isPast && !isCurrent} className={`flex min-h-[44px] items-center gap-2 rounded-full px-1 transition-colors ${isPast ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
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
