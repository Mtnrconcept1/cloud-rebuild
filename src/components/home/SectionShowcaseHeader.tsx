import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SectionHeaderTheme = "orange" | "rose" | "sky" | "amber" | "indigo" | "emerald" | "blue" | "slate";

type SectionShowcaseHeaderProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  imageSrc: string;
  iconColor?: string;
  theme?: SectionHeaderTheme;
  linkText?: string;
  linkTo?: string;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  illustrationClassName?: string;
  imageClassName?: string;
  actions?: ReactNode;
};

const themeClasses: Record<
  SectionHeaderTheme,
  {
    panel: string;
    eyebrow: string;
    iconBubble: string;
  }
> = {
  // Each theme is a single hue family: a tonal glow behind the illustration
  // fading into a near-background base. The previous two-hue washes
  // (peach into mint, blue into violet) muddied every panel.
  orange: {
    panel:
      "border-orange-200/70 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(255,138,48,0.32),transparent_62%),linear-gradient(175deg,#fff5ea_0%,#fffcf8_78%)] dark:border-orange-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(249,115,22,0.24),transparent_62%),linear-gradient(175deg,hsl(24_15%_13%)_0%,hsl(24_16%_9%)_78%)]",
    eyebrow: "text-orange-700 dark:text-orange-200",
    iconBubble: "bg-orange-500/12 text-orange-700 ring-1 ring-orange-500/20 dark:bg-orange-300/12 dark:text-orange-200 dark:ring-orange-300/20",
  },
  rose: {
    panel:
      "border-rose-200/70 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(244,63,94,0.24),transparent_62%),linear-gradient(175deg,#fff4f5_0%,#fffbfb_78%)] dark:border-rose-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(244,63,94,0.22),transparent_62%),linear-gradient(175deg,hsl(350_14%_13%)_0%,hsl(348_16%_9%)_78%)]",
    eyebrow: "text-rose-700 dark:text-rose-200",
    iconBubble: "bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/20 dark:bg-rose-300/12 dark:text-rose-200 dark:ring-rose-300/20",
  },
  sky: {
    panel:
      "border-sky-200/70 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(56,189,248,0.28),transparent_62%),linear-gradient(175deg,#f1faff_0%,#fbfdff_78%)] dark:border-sky-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(56,189,248,0.20),transparent_62%),linear-gradient(175deg,hsl(205_18%_13%)_0%,hsl(206_20%_9%)_78%)]",
    eyebrow: "text-sky-700 dark:text-sky-200",
    iconBubble: "bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-300/12 dark:text-sky-200 dark:ring-sky-300/20",
  },
  amber: {
    panel:
      "border-amber-200/80 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(251,191,36,0.34),transparent_62%),linear-gradient(175deg,#fff9e8_0%,#fffdf6_78%)] dark:border-amber-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(245,158,11,0.24),transparent_62%),linear-gradient(175deg,hsl(36_16%_13%)_0%,hsl(34_18%_9%)_78%)]",
    eyebrow: "text-amber-700 dark:text-amber-200",
    iconBubble: "bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-300/12 dark:text-amber-200 dark:ring-amber-300/20",
  },
  indigo: {
    panel:
      "border-indigo-200/70 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(129,140,248,0.28),transparent_62%),linear-gradient(175deg,#f3f4ff_0%,#fbfbff_78%)] dark:border-indigo-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(129,140,248,0.22),transparent_62%),linear-gradient(175deg,hsl(246_16%_14%)_0%,hsl(246_18%_10%)_78%)]",
    eyebrow: "text-indigo-700 dark:text-indigo-200",
    iconBubble: "bg-indigo-500/12 text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-300/12 dark:text-indigo-200 dark:ring-indigo-300/20",
  },
  emerald: {
    panel:
      "border-emerald-200/80 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(16,185,129,0.26),transparent_62%),linear-gradient(175deg,#eefbf5_0%,#f9fdfb_78%)] dark:border-emerald-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(16,185,129,0.20),transparent_62%),linear-gradient(175deg,hsl(160_14%_12%)_0%,hsl(160_16%_9%)_78%)]",
    eyebrow: "text-emerald-700 dark:text-emerald-200",
    iconBubble: "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-300/12 dark:text-emerald-200 dark:ring-emerald-300/20",
  },
  blue: {
    panel:
      "border-blue-200/70 bg-[radial-gradient(110%_130%_at_86%_4%,rgba(59,130,246,0.26),transparent_62%),linear-gradient(175deg,#f1f6ff_0%,#fbfcff_78%)] dark:border-blue-400/20 dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(59,130,246,0.22),transparent_62%),linear-gradient(175deg,hsl(220_18%_13%)_0%,hsl(220_20%_9%)_78%)]",
    eyebrow: "text-blue-700 dark:text-blue-200",
    iconBubble: "bg-blue-500/12 text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-300/12 dark:text-blue-200 dark:ring-blue-300/20",
  },
  slate: {
    panel:
      "border-border bg-[radial-gradient(110%_130%_at_86%_4%,rgba(168,152,138,0.24),transparent_62%),linear-gradient(175deg,#faf7f4_0%,#fffdfb_78%)] dark:border-border dark:bg-[radial-gradient(110%_130%_at_86%_4%,rgba(168,152,138,0.14),transparent_62%),linear-gradient(175deg,hsl(24_14%_13%)_0%,hsl(24_16%_9%)_78%)]",
    eyebrow: "text-muted-foreground",
    iconBubble: "bg-foreground/[0.06] text-foreground/70 ring-1 ring-border",
  },
};

const HEART_HEADER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="heartGlow" cx="33%" cy="22%" r="72%">
      <stop offset="0%" stop-color="#ffd4e7"/>
      <stop offset="33%" stop-color="#ff6fa4"/>
      <stop offset="68%" stop-color="#f31573"/>
      <stop offset="100%" stop-color="#c90e5f"/>
    </radialGradient>
    <linearGradient id="heartEdge" x1="18%" y1="8%" x2="88%" y2="92%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.82"/>
      <stop offset="36%" stop-color="#ff9ac2" stop-opacity="0.55"/>
      <stop offset="72%" stop-color="#b90057" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.28"/>
    </linearGradient>
    <filter id="softHeartShadow" x="-25%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="20" flood-color="#e11d67" flood-opacity="0.24"/>
    </filter>
    <filter id="pinkBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>
  <ellipse cx="294" cy="394" rx="154" ry="42" fill="#fb3d84" opacity="0.18" transform="rotate(-9 294 394)" filter="url(#pinkBlur)"/>
  <path d="M256 420C165 344 92 289 92 199c0-58 42-101 96-101 34 0 61 17 76 45 15-28 43-45 80-45 54 0 96 43 96 101 0 90-77 145-184 221Z" fill="url(#heartGlow)" filter="url(#softHeartShadow)"/>
  <path d="M256 420C165 344 92 289 92 199c0-58 42-101 96-101 34 0 61 17 76 45 15-28 43-45 80-45 54 0 96 43 96 101 0 90-77 145-184 221Z" fill="none" stroke="url(#heartEdge)" stroke-width="14" stroke-linejoin="round" opacity="0.8"/>
  <path d="M149 173c14-37 56-54 94-34 12 6 20 14 27 26-16-12-43-24-76-11-27 10-42 31-45 56-2-13-4-25 0-37Z" fill="#ffffff" opacity="0.42"/>
  <path d="M290 145c32-29 88-14 102 31 5 16 4 32 1 45-10-41-47-65-88-48-18 7-31 22-40 38 2-26 10-51 25-66Z" fill="#ffffff" opacity="0.28"/>
  <path d="M160 139c30-31 83-29 113 8" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="12" stroke-linecap="round"/>
  <path d="M332 128c42 2 75 30 84 70" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="10" stroke-linecap="round"/>
  <path d="M173 355c43 28 103 40 160-3" fill="none" stroke="#9f0a52" stroke-opacity="0.18" stroke-width="16" stroke-linecap="round"/>
  <path d="M368 348c38 4 64 17 72 28" fill="none" stroke="#ff8fbd" stroke-opacity="0.36" stroke-width="10" stroke-linecap="round"/>
  <path d="M388 374l7 15 16 6-16 6-7 15-7-15-16-6 16-6 7-15Z" fill="#ffffff" opacity="0.92"/>
  <circle cx="358" cy="407" r="5" fill="#ffffff" opacity="0.9"/>
  <circle cx="337" cy="422" r="3.5" fill="#ffffff" opacity="0.85"/>
  <circle cx="319" cy="437" r="2.8" fill="#ffffff" opacity="0.72"/>
</svg>`)} `;

const imageSrcOverrides: Record<string, string> = {
  "/images/section-headers/heart-3d.png": HEART_HEADER_IMAGE.trim(),
};

export default function SectionShowcaseHeader({
  title,
  subtitle,
  icon: Icon,
  imageSrc,
  iconColor,
  theme = "orange",
  linkText,
  linkTo,
  className,
  titleClassName,
  contentClassName,
  illustrationClassName,
  imageClassName,
  actions,
}: SectionShowcaseHeaderProps) {
  const palette = themeClasses[theme];
  const resolvedImageSrc = imageSrcOverrides[imageSrc] || imageSrc;
  const hasFooterActions = Boolean((linkText && linkTo) || actions);
  const reduceMotion = useReducedMotion();
  const illustrationMotion = reduceMotion
    ? {}
    : {
        initial: { y: 12, scale: 0.97 },
        whileInView: { y: [12, -8, 3, 0], scale: [0.97, 1.035, 0.995, 1] },
        viewport: { once: false, amount: 0.45 },
        transition: { duration: 0.68, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div
      data-section-showcase-header
      className={cn(
        "relative isolate min-h-[238px] overflow-visible rounded-[2rem] border px-5 pb-20 pt-6 shadow-lg sm:min-h-[258px] sm:px-7 sm:pt-7 md:min-h-[286px] md:px-8 md:pt-8",
        palette.panel,
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
        <div className="absolute inset-0 bg-[linear-gradient(94deg,rgba(255,255,255,0.62)_0%,rgba(255,255,255,0.18)_46%,rgba(255,255,255,0)_72%)] dark:bg-[linear-gradient(94deg,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.10)_48%,rgba(0,0,0,0)_74%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,hsl(var(--background)/0.72)_72%,hsl(var(--background)/0.94))]" />
        <div className="absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-white/50 dark:ring-white/[0.06]" />
      </div>

      <motion.div
        data-section-illustration
        className={cn(
          "pointer-events-none absolute bottom-0 right-5 -top-1 z-[55] w-[40%] min-w-[8rem] max-w-[14.5rem] overflow-visible rounded-br-[2rem] sm:right-8 sm:-top-2 sm:w-[41%] sm:max-w-[20rem] md:right-10 md:-top-3 md:w-[42%] md:max-w-[24rem]",
          illustrationClassName,
        )}
        {...illustrationMotion}
      >
        <img
          src={resolvedImageSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-y-0 right-0 h-full max-h-none w-full object-contain object-center",
            imageClassName,
          )}
        />
      </motion.div>

      <div
        className={cn(
          "relative z-50 min-w-0 max-w-[calc(100%-6.5rem)] pr-1 min-[380px]:max-w-[calc(100%-10.75rem)] min-[380px]:pr-2 sm:max-w-[calc(100%-14.75rem)] sm:pr-4 md:max-w-[calc(100%-19.5rem)] md:pr-6",
          contentClassName,
        )}
      >
        <div className={cn("mb-4 flex min-w-0 max-w-full items-center gap-2.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] min-[380px]:mb-5 min-[380px]:text-xs min-[380px]:tracking-[0.2em]", iconColor || palette.eyebrow)}>
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", palette.iconBubble)}>
            <Icon className="h-4 w-4 fill-current" />
          </span>
          <span className="min-w-0 break-words">{subtitle}</span>
        </div>
        <h2 className={cn("font-display text-[1.55rem] font-bold leading-[1.05] tracking-[-0.022em] text-foreground [hyphens:auto] min-[380px]:text-[1.8rem] sm:text-5xl md:text-6xl", titleClassName)}>
          {title}
        </h2>
      </div>

      {hasFooterActions ? (
        <div
          data-section-action-row
          className="absolute bottom-5 left-5 z-[60] flex min-w-0 max-w-[calc(100%-6.5rem)] items-center justify-start gap-2 min-[380px]:max-w-[calc(100%-10.75rem)] sm:left-7 sm:max-w-[calc(100%-14.75rem)] md:max-w-[calc(100%-19.5rem)]"
        >
          {actions}
          {linkText && linkTo ? (
            <Button
              variant="ghost"
              size="sm"
              className="group/cta h-11 max-w-full rounded-full border border-border/70 bg-surface-raised/80 px-4 text-sm font-bold text-foreground shadow-sm backdrop-blur-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-raised hover:text-primary hover:shadow-md"
              asChild
            >
              <Link to={linkTo}>
                <span className="min-w-0 truncate">{linkText}</span>
                <ChevronRight className="ml-1 h-4 w-4 shrink-0 transition-transform duration-base ease-out-soft group-hover/cta:translate-x-0.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
