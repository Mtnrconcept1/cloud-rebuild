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
  orange: {
    panel:
      "border-orange-200/70 bg-[radial-gradient(circle_at_78%_18%,rgba(255,186,112,0.55),transparent_16rem),linear-gradient(135deg,#fff7ed_0%,#ffedd5_48%,#dcfce7_100%)] dark:border-orange-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(249,115,22,0.26),transparent_16rem),linear-gradient(135deg,rgba(67,20,7,0.78),rgba(17,24,39,0.96))]",
    eyebrow: "text-orange-600 dark:text-orange-200",
    iconBubble: "bg-orange-500/12 text-orange-600 dark:bg-orange-300/15 dark:text-orange-200",
  },
  rose: {
    panel:
      "border-rose-200/70 bg-[radial-gradient(circle_at_78%_18%,rgba(251,113,133,0.36),transparent_16rem),linear-gradient(135deg,#fff1f2_0%,#fce7f3_48%,#fff7ed_100%)] dark:border-rose-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(244,114,182,0.22),transparent_16rem),linear-gradient(135deg,rgba(76,5,25,0.76),rgba(17,24,39,0.96))]",
    eyebrow: "text-pink-600 dark:text-pink-200",
    iconBubble: "bg-pink-500/12 text-pink-600 dark:bg-pink-300/15 dark:text-pink-200",
  },
  sky: {
    panel:
      "border-sky-200/70 bg-[radial-gradient(circle_at_78%_18%,rgba(125,211,252,0.46),transparent_16rem),linear-gradient(135deg,#f0f9ff_0%,#e0f2fe_50%,#ecfeff_100%)] dark:border-sky-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.22),transparent_16rem),linear-gradient(135deg,rgba(8,47,73,0.74),rgba(17,24,39,0.96))]",
    eyebrow: "text-sky-600 dark:text-sky-200",
    iconBubble: "bg-sky-500/12 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200",
  },
  amber: {
    panel:
      "border-amber-200/80 bg-[radial-gradient(circle_at_78%_18%,rgba(251,191,36,0.46),transparent_16rem),linear-gradient(135deg,#fffbeb_0%,#fef3c7_48%,#fff7ed_100%)] dark:border-amber-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(245,158,11,0.24),transparent_16rem),linear-gradient(135deg,rgba(69,26,3,0.76),rgba(17,24,39,0.96))]",
    eyebrow: "text-amber-700 dark:text-amber-200",
    iconBubble: "bg-amber-500/12 text-amber-700 dark:bg-amber-300/15 dark:text-amber-200",
  },
  indigo: {
    panel:
      "border-indigo-200/70 bg-[radial-gradient(circle_at_78%_18%,rgba(165,180,252,0.48),transparent_16rem),linear-gradient(135deg,#eef2ff_0%,#e0e7ff_48%,#f5f3ff_100%)] dark:border-indigo-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(129,140,248,0.24),transparent_16rem),linear-gradient(135deg,rgba(30,27,75,0.78),rgba(17,24,39,0.96))]",
    eyebrow: "text-indigo-600 dark:text-indigo-200",
    iconBubble: "bg-indigo-500/12 text-indigo-600 dark:bg-indigo-300/15 dark:text-indigo-200",
  },
  emerald: {
    panel:
      "border-emerald-200/80 bg-[radial-gradient(circle_at_78%_18%,rgba(110,231,183,0.5),transparent_16rem),linear-gradient(135deg,#ecfdf5_0%,#d1fae5_50%,#f0fdfa_100%)] dark:border-emerald-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(52,211,153,0.22),transparent_16rem),linear-gradient(135deg,rgba(6,78,59,0.74),rgba(17,24,39,0.96))]",
    eyebrow: "text-emerald-700 dark:text-emerald-200",
    iconBubble: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-200",
  },
  blue: {
    panel:
      "border-blue-200/70 bg-[radial-gradient(circle_at_78%_18%,rgba(147,197,253,0.48),transparent_16rem),linear-gradient(135deg,#eff6ff_0%,#dbeafe_48%,#eef2ff_100%)] dark:border-blue-300/20 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(96,165,250,0.22),transparent_16rem),linear-gradient(135deg,rgba(30,58,138,0.72),rgba(17,24,39,0.96))]",
    eyebrow: "text-blue-600 dark:text-blue-200",
    iconBubble: "bg-blue-500/12 text-blue-600 dark:bg-blue-300/15 dark:text-blue-200",
  },
  slate: {
    panel:
      "border-slate-200/80 bg-[radial-gradient(circle_at_78%_18%,rgba(148,163,184,0.34),transparent_16rem),linear-gradient(135deg,#f8fafc_0%,#f1f5f9_48%,#fff7ed_100%)] dark:border-slate-300/15 dark:bg-[radial-gradient(circle_at_78%_18%,rgba(148,163,184,0.16),transparent_16rem),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(17,24,39,0.98))]",
    eyebrow: "text-slate-600 dark:text-slate-200",
    iconBubble: "bg-slate-500/12 text-slate-600 dark:bg-slate-300/15 dark:text-slate-200",
  },
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
  const hasFooterActions = Boolean((linkText && linkTo) || actions);
  const reduceMotion = useReducedMotion();
  const illustrationMotion = reduceMotion
    ? {}
    : {
        initial: { y: 12, scale: 0.97 },
        whileInView: { y: [12, -8, 3, 0], scale: [0.97, 1.035, 0.995, 1] },
        viewport: { once: false, amount: 0.45 },
        transition: { duration: 0.68, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <div
      data-section-showcase-header
      className={cn(
        "relative isolate min-h-[238px] overflow-visible rounded-[2rem] border px-5 pb-20 pt-6 shadow-[0_24px_55px_rgba(15,23,42,0.10)] sm:min-h-[258px] sm:px-7 sm:pt-7 md:min-h-[286px] md:px-8 md:pt-8",
        palette.panel,
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.78),rgba(255,255,255,0.18)_58%,rgba(255,255,255,0))] dark:bg-[linear-gradient(90deg,rgba(15,23,42,0.38),rgba(15,23,42,0.08)_58%,rgba(15,23,42,0))]" />
        <div className="absolute -bottom-24 left-1/2 h-40 w-[148%] -translate-x-1/2 rounded-[100%] bg-background shadow-[0_-16px_45px_rgba(255,255,255,0.62)] dark:bg-slate-950 dark:shadow-[0_-16px_45px_rgba(15,23,42,0.55)]" />
      </div>

      <motion.div
        data-section-illustration
        className={cn(
          "pointer-events-none absolute -right-10 -top-6 bottom-0 z-40 w-56 overflow-visible rounded-br-[2rem] sm:-right-12 sm:-top-7 sm:w-96 md:-right-10 md:-top-8 md:w-[28rem]",
          illustrationClassName,
        )}
        {...illustrationMotion}
      >
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute bottom-0 right-0 h-48 w-48 translate-x-3 object-contain object-bottom sm:h-72 sm:w-72 sm:translate-x-4 md:h-[22rem] md:w-[22rem] md:translate-x-2",
            imageClassName,
          )}
        />
      </motion.div>

      <div className={cn("relative z-10 max-w-[17rem] pr-24 sm:max-w-sm sm:pr-32 md:max-w-2xl md:pr-44", contentClassName)}>
        <div className={cn("mb-5 flex w-fit items-center gap-2 font-bold text-xs uppercase tracking-[0.18em]", iconColor || palette.eyebrow)}>
          <span className={cn("grid h-8 w-8 place-items-center rounded-full", palette.iconBubble)}>
            <Icon className="h-4 w-4 fill-current" />
          </span>
          <span>{subtitle}</span>
        </div>
        <h2 className={cn("font-display text-4xl font-bold leading-[0.98] tracking-normal text-slate-950 dark:text-white sm:text-5xl md:text-6xl", titleClassName)}>
          {title}
        </h2>
      </div>

      {hasFooterActions ? (
        <div
          data-section-action-row
          className="absolute bottom-5 left-5 z-50 flex max-w-[calc(100%-9.5rem)] items-center justify-start gap-2 sm:left-7 sm:max-w-[calc(100%-13rem)] md:max-w-[calc(100%-24rem)]"
        >
          {actions}
          {linkText && linkTo ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 max-w-full rounded-full bg-white/55 px-4 text-sm font-bold text-slate-950 shadow-sm backdrop-blur-sm hover:bg-white/80 hover:text-primary dark:bg-slate-950/35 dark:text-white dark:hover:bg-white/10 dark:hover:text-orange-200"
              asChild
            >
              <Link to={linkTo}>
                <span className="min-w-0 truncate">{linkText}</span>
                <ChevronRight className="ml-1 h-4 w-4 shrink-0" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
