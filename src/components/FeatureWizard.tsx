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
    description: "Off-menu & ultra-limitées, imaginées par des chefs sélectionnés.",
    icon: ChefHat,
  },
  {
    title: "Chefs partenaires",
    description: "Talents sélectionnés pour leur excellence.",
    icon: Crown,
  },
  {
    title: "Expérience premium",
    description: "Réservée aux gourmets en quête d'exception.",
    icon: Sparkles,
  },
  {
    title: "Paiement sécurisé",
    description: "Transaction sécurisée et données protégées.",
    icon: ShieldCheck,
  },
] as const;

const GOLDEN_TOK_SCOPED_STYLES = `
body:has([data-golden-tok-chefs-table]) {
  background: #070706;
}

body:has([data-golden-tok-chefs-table]) header.sticky {
  border-color: rgba(203, 153, 55, 0.46) !important;
  background: linear-gradient(180deg, rgba(8, 8, 7, 0.99), rgba(10, 10, 9, 0.97)) !important;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38), inset 0 -1px 0 rgba(218, 172, 75, 0.12) !important;
  backdrop-filter: blur(18px) !important;
}

body:has([data-golden-tok-chefs-table]) header.sticky .text-muted-foreground {
  color: #d9cfbd !important;
}

body:has([data-golden-tok-chefs-table]) header.sticky img[alt="Tok"] {
  filter: drop-shadow(0 10px 18px rgba(190, 129, 24, 0.24));
}

body:has([data-golden-tok-chefs-table]) div:has(+ header.sticky) {
  border-color: rgba(203, 153, 55, 0.28) !important;
  background: #090908 !important;
  color: #cfc3ad !important;
}

body:has([data-golden-tok-chefs-table]) footer {
  display: none !important;
}

[data-golden-tok-chefs-table] {
  --gold: #d9aa47;
  --gold-soft: #f1cf7b;
  --gold-deep: #9b6716;
  --ink: #080807;
  --panel: #10100e;
  --panel-soft: #17150f;
  --cream: #f7edd6;
  --muted-gold: #b4a588;
  background:
    radial-gradient(circle at 75% 9%, rgba(179, 119, 26, 0.14), transparent 30%),
    radial-gradient(circle at 37% 43%, rgba(121, 86, 27, 0.07), transparent 34%),
    linear-gradient(115deg, #070706 0%, #0b0a08 58%, #080807 100%);
  color: var(--cream);
}

[data-golden-tok-chefs-table] .golden-tok-rail {
  position: relative;
  overflow: hidden;
  border-right: 1px solid rgba(210, 161, 62, 0.43);
  background:
    repeating-radial-gradient(ellipse at -8% 48%, transparent 0 12px, rgba(197, 145, 48, 0.08) 13px 14px, transparent 15px 27px),
    linear-gradient(180deg, rgba(21, 18, 12, 0.54), rgba(7, 7, 6, 0.05));
}

[data-golden-tok-chefs-table] .golden-tok-rail::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 30%, rgba(218, 170, 70, 0.12), transparent 28%);
}

[data-golden-tok-chefs-table] .golden-tok-stage {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 18px;
}

[data-golden-tok-chefs-table] .golden-tok-content,
[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] {
  display: contents;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > * {
  margin-top: 0 !important;
}

[data-golden-tok-chefs-table] .golden-tok-heading { order: 1; }
[data-golden-tok-chefs-table] .golden-tok-stepper { order: 2; }
[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child { order: 3; }
[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:nth-child(2) { order: 4; }
[data-golden-tok-chefs-table] .golden-tok-benefits { order: 5; }
[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky { order: 6; }

[data-golden-tok-chefs-table] .golden-tok-heading h1 {
  color: #fff5dc !important;
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 600;
  letter-spacing: -0.045em;
  text-wrap: balance;
}

[data-golden-tok-chefs-table] .golden-tok-heading p {
  color: #c9bda8;
}

[data-golden-tok-chefs-table] .golden-tok-header-action button {
  min-height: 48px;
  border: 1px solid rgba(217, 171, 73, 0.72) !important;
  border-radius: 999px !important;
  background: linear-gradient(180deg, #17140f 0%, #0b0b09 100%) !important;
  color: #efca72 !important;
  box-shadow: 0 15px 34px -22px rgba(177, 117, 15, 0.52), inset 0 1px 0 rgba(255,255,255,0.06);
}

[data-golden-tok-chefs-table] .golden-tok-header-action button:hover {
  border-color: rgba(238, 202, 117, 0.95) !important;
  background: linear-gradient(180deg, #211c13 0%, #11100c 100%) !important;
  color: #ffe09a !important;
}

[data-golden-tok-chefs-table] .golden-tok-stepper {
  border: 1px solid rgba(205, 155, 56, 0.36);
  background: linear-gradient(180deg, rgba(28, 25, 18, 0.75), rgba(16, 15, 12, 0.84));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 45px -36px rgba(199, 141, 35, 0.65);
}

[data-golden-tok-chefs-table] .golden-tok-stepper-label-active {
  color: #fff2d3;
}

[data-golden-tok-chefs-table] .golden-tok-stepper-label-idle {
  color: #9c9487;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child {
  min-height: 54px;
  border-color: rgba(194, 145, 50, 0.52) !important;
  background: linear-gradient(100deg, #0b0d0a 0%, #0b0c0a 70%, #0d1009 100%) !important;
  color: #f5e4bd !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 36px -30px rgba(215, 164, 67, 0.72);
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child > div:first-child {
  background: #8fd434 !important;
  box-shadow: 0 0 0 6px rgba(132, 205, 47, 0.1), 0 0 18px rgba(132, 205, 47, 0.4);
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child span {
  color: #f0d588 !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child .ml-auto {
  border-color: rgba(117, 192, 43, 0.58) !important;
  background: rgba(16, 35, 6, 0.24) !important;
  color: #9be447 !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > [class~="grid"][class~="gap-6"] {
  display: flex !important;
  gap: 14px !important;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding: 2px 2px 12px;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > [class~="grid"][class~="gap-6"]::-webkit-scrollbar {
  display: none;
}

[data-golden-tok-chefs-table] .golden-tok-content article {
  flex: 0 0 min(82vw, 352px);
  min-width: 0;
  scroll-snap-align: start;
  overflow: hidden;
  border: 1px solid rgba(200, 149, 51, 0.52) !important;
  border-radius: 22px !important;
  background: linear-gradient(150deg, #17150f 0%, #100f0c 48%, #0b0b09 100%) !important;
  color: #f6ead0 !important;
  box-shadow: 0 24px 58px -40px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.04) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:first-child {
  height: 265px;
  overflow: hidden;
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:first-child img {
  height: 100% !important;
  width: 100%;
  object-fit: cover;
  filter: saturate(0.93) contrast(1.04) brightness(0.88);
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:first-child::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0.05) 22%, rgba(5,5,4,0.12) 45%, rgba(7,7,6,0.88) 100%);
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:first-child > div {
  z-index: 2;
}

[data-golden-tok-chefs-table] .golden-tok-content article h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.36rem !important;
  font-weight: 600 !important;
  color: #fff3d7 !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article .text-foreground {
  color: #fff2d5 !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article .text-muted-foreground {
  color: #bfb39e !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:nth-child(2) {
  display: flex !important;
  flex-direction: column;
  gap: 13px !important;
  padding: 15px !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:nth-child(2) > div:first-child > div:first-child {
  border-color: rgba(202, 151, 53, 0.2) !important;
  background: rgba(255,255,255,0.018) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article > div:nth-child(2) > div:last-child {
  border-color: rgba(202, 151, 53, 0.2) !important;
  background: rgba(4,4,3,0.28) !important;
  box-shadow: none !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article button {
  border-color: rgba(217, 171, 73, 0.58) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content article button[class*="bg-amber"] {
  background: linear-gradient(180deg, #f0cd77 0%, #c79030 100%) !important;
  color: #171108 !important;
  box-shadow: 0 15px 32px -23px rgba(230, 176, 65, 0.94) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] {
  position: relative;
  overflow: hidden;
  min-height: 320px;
  border-style: solid !important;
  border-color: rgba(202, 151, 53, 0.42) !important;
  background:
    radial-gradient(circle at 50% 25%, rgba(200, 150, 51, 0.14), transparent 31%),
    repeating-linear-gradient(45deg, rgba(214,166,67,0.025) 0 1px, transparent 1px 20px),
    #0e0e0c !important;
  color: #f8ecd1 !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 28px 70px -54px rgba(210, 151, 45, 0.72);
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"]::after {
  content: "★  ★  ★";
  display: block;
  position: relative;
  margin-top: 18px;
  color: #d2a342;
  font-size: 16px;
  letter-spacing: 0.18em;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] > svg {
  position: relative;
  z-index: 1;
  width: 72px !important;
  height: 72px !important;
  padding: 18px;
  border: 1px solid rgba(220, 176, 77, 0.72);
  border-radius: 9999px;
  background: #14130f;
  color: #dfb750 !important;
  box-shadow: 0 13px 35px -18px rgba(0,0,0,0.7), 0 0 0 7px rgba(213, 168, 68, 0.06);
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] h2,
[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] p {
  position: relative;
  z-index: 1;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] h2 {
  color: #fff3d7 !important;
  font-family: Georgia, "Times New Roman", serif;
}

[data-golden-tok-chefs-table] .golden-tok-content [class~="border-dashed"] p {
  color: #bfb29d !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky {
  position: relative !important;
  bottom: auto !important;
  z-index: 20;
  width: 100%;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky > div {
  margin: 0 !important;
  border-color: rgba(207, 157, 58, 0.58) !important;
  border-radius: 24px !important;
  background: linear-gradient(145deg, #11110e 0%, #090a08 72%) !important;
  color: #f7ecd6 !important;
  box-shadow: 0 30px 70px -48px rgba(0,0,0,0.96), inset 0 1px 0 rgba(255,255,255,0.04) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky > div > div:first-child {
  flex-direction: column !important;
  align-items: stretch !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky .grid {
  grid-template-columns: minmax(0, 1fr) !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky p {
  color: #d7cbb7;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky p.font-display {
  color: #fff0cf !important;
}

[data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky > div > button {
  min-height: 54px;
  border-radius: 14px !important;
  background: linear-gradient(180deg, #f5d98e 0%, #d3a84d 100%) !important;
  color: #1d1509 !important;
  box-shadow: 0 16px 36px -24px rgba(233, 188, 94, 0.95) !important;
}

[data-golden-tok-chefs-table] .golden-tok-benefits {
  overflow: hidden;
  border: 1px solid rgba(207, 157, 58, 0.5);
  border-radius: 22px;
  background: linear-gradient(120deg, #15130f 0%, #0e0e0c 100%);
  box-shadow: 0 24px 64px -48px rgba(218, 161, 53, 0.72);
}

[data-golden-tok-chefs-table] .golden-tok-benefit {
  border-color: rgba(207, 157, 58, 0.18);
}

[data-golden-tok-chefs-table] .golden-tok-benefit-icon {
  border: 1px solid rgba(216, 171, 73, 0.7);
  background: #15130f;
  color: #e1b851;
  box-shadow: 0 10px 26px -17px rgba(229, 174, 68, 0.78);
}

@media (min-width: 640px) {
  [data-golden-tok-chefs-table] .golden-tok-content article {
    flex-basis: min(68vw, 365px);
  }
}

@media (min-width: 1280px) {
  [data-golden-tok-chefs-table] .golden-tok-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    column-gap: 24px;
    row-gap: 18px;
    align-items: start;
  }

  [data-golden-tok-chefs-table] .golden-tok-heading {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  [data-golden-tok-chefs-table] .golden-tok-stepper {
    grid-column: 1;
    grid-row: 2;
  }

  [data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:first-child {
    grid-column: 1;
    grid-row: 3;
  }

  [data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > div:nth-child(2) {
    grid-column: 1;
    grid-row: 4;
  }

  [data-golden-tok-chefs-table] .golden-tok-benefits {
    grid-column: 1;
    grid-row: 5;
  }

  [data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > .sticky {
    grid-column: 2;
    grid-row: 2 / span 4;
    position: sticky !important;
    top: calc(var(--tok-public-navbar-offset, 80px) + 22px);
    align-self: start;
  }

  [data-golden-tok-chefs-table] .golden-tok-content > [class~="space-y-8"] > [class~="grid"][class~="gap-6"] {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px !important;
    overflow: visible;
    padding: 0;
  }

  [data-golden-tok-chefs-table] .golden-tok-content article {
    min-width: 0;
    width: 100%;
  }

  [data-golden-tok-chefs-table] .golden-tok-content article > div:first-child {
    height: 250px;
  }

  [data-golden-tok-chefs-table] .golden-tok-benefits {
    background: linear-gradient(110deg, #f5e5bf 0%, #ead2a0 100%);
    color: #21170b;
  }

  [data-golden-tok-chefs-table] .golden-tok-benefit + .golden-tok-benefit {
    border-left: 1px solid rgba(91, 60, 15, 0.14);
  }

  [data-golden-tok-chefs-table] .golden-tok-benefit-title {
    color: #281c0d !important;
  }

  [data-golden-tok-chefs-table] .golden-tok-benefit-description {
    color: #57472e !important;
  }
}

@media (max-width: 767px) {
  body:has([data-golden-tok-chefs-table]) header.sticky img[alt="Tok"] {
    height: 54px !important;
  }

  [data-golden-tok-chefs-table] .golden-tok-heading {
    padding-top: 4px;
  }

  [data-golden-tok-chefs-table] .golden-tok-heading h1 {
    font-size: clamp(2.15rem, 11vw, 3.15rem) !important;
    line-height: 0.98 !important;
  }

  [data-golden-tok-chefs-table] .golden-tok-header-action {
    width: 100%;
  }

  [data-golden-tok-chefs-table] .golden-tok-header-action button {
    width: 100%;
  }

  [data-golden-tok-chefs-table] .golden-tok-stepper {
    border-radius: 22px;
  }

  [data-golden-tok-chefs-table] .golden-tok-benefit {
    min-height: 130px;
  }
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
    <main data-golden-tok-chefs-table className="relative min-h-screen overflow-hidden bg-[#070706] text-[#f7edd6]">
      <style>{GOLDEN_TOK_SCOPED_STYLES}</style>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_7%,rgba(181,119,24,0.13),transparent_29%),radial-gradient(circle_at_32%_56%,rgba(181,119,24,0.05),transparent_33%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c99936]/60 to-transparent" />

      <div className="relative mx-auto grid w-full max-w-[1600px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="golden-tok-rail hidden min-h-[calc(100vh-var(--tok-public-navbar-offset,80px))] flex-col items-center px-7 py-14 lg:flex lg:sticky lg:top-[var(--tok-public-navbar-offset,80px)] lg:self-start">
          <div className="relative z-[1] w-full max-w-[220px]">
            <div aria-hidden="true" className="absolute inset-[15%] rounded-full bg-[#d8ae4f]/15 blur-3xl" />
            <img
              src={GOLDEN_TOK_LOGO}
              alt="Golden TOK"
              className="relative h-auto w-full select-none object-contain drop-shadow-[0_24px_30px_rgba(96,61,5,0.34)]"
              draggable={false}
              loading="eager"
            />
          </div>
          <div className="relative z-[1] mt-7 flex items-center gap-3 text-center text-[10px] font-semibold uppercase tracking-[0.38em] text-[#d6ab4d]">
            <span className="h-px w-7 bg-current/45" />
            Édition signature
            <span className="h-px w-7 bg-current/45" />
          </div>
        </aside>

        <section className="golden-tok-stage min-w-0 px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-9 xl:py-10">
          <div className="golden-tok-heading flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#d8ae4f]/72 bg-[#11100d] text-[#e1b851] shadow-[0_14px_32px_-20px_rgba(0,0,0,0.78),0_0_0_6px_rgba(216,174,79,0.05)] sm:flex sm:h-16 sm:w-16">
                <ChefHat className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.38em] text-[#d7aa49] sm:text-[11px]">
                  Golden TOK
                </p>
                <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl xl:text-[56px]">
                  {title}
                </h1>
                <p className="mt-3 text-sm sm:text-base">{subtitle}</p>
              </div>
            </div>

            {headerAction ? (
              <div className="golden-tok-header-action shrink-0 md:pl-4">{headerAction}</div>
            ) : null}
          </div>

          <div className="golden-tok-stepper rounded-[20px] px-4 py-3 sm:px-5">
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
                        className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition sm:h-10 sm:w-10 ${
                          isCurrent
                            ? "border-[#edcf84] bg-gradient-to-br from-[#f4d98f] to-[#bd8427] text-[#1c1408] shadow-[0_8px_20px_-8px_rgba(183,120,18,0.85)]"
                            : isPast
                              ? "border-[#d8ae4f]/45 bg-[#d8ae4f]/12 text-[#e7c96f]"
                              : "border-white/10 bg-white/[0.055] text-white/45"
                        }`}
                      >
                        {isPast ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className={isCurrent ? "golden-tok-stepper-label-active font-semibold" : "golden-tok-stepper-label-idle"}>
                        {step.label}
                      </span>
                    </button>

                    {index < steps.length - 1 ? (
                      <div className="mx-2 h-px min-w-5 flex-1 bg-gradient-to-r from-[#d1a13d]/85 via-[#b88425]/70 to-white/10 sm:mx-4" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="golden-tok-content">{children}</div>

          <div className="golden-tok-benefits">
            <div className="grid grid-cols-2 xl:grid-cols-4">
              {GOLDEN_TOK_BENEFITS.map(({ title: benefitTitle, description, icon: BenefitIcon }, index) => (
                <div
                  key={benefitTitle}
                  className={`golden-tok-benefit flex flex-col items-center gap-3 px-3 py-5 text-center xl:flex-row xl:items-center xl:px-4 xl:text-left ${
                    index >= 2 ? "border-t xl:border-t-0" : ""
                  } ${index % 2 === 1 ? "border-l" : ""}`}
                >
                  <span className="golden-tok-benefit-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-full xl:h-11 xl:w-11">
                    <BenefitIcon className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="golden-tok-benefit-title block text-sm font-semibold text-[#efc96e]">{benefitTitle}</span>
                    <span className="golden-tok-benefit-description mt-1 block text-[11px] leading-4 text-white/58 xl:text-xs xl:leading-5">{description}</span>
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
