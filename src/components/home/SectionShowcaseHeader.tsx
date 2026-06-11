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

const PIN_HEADER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="pinPink" cx="28%" cy="20%" r="78%">
      <stop offset="0%" stop-color="#ffd0ee"/>
      <stop offset="34%" stop-color="#ff4fb1"/>
      <stop offset="70%" stop-color="#ec168d"/>
      <stop offset="100%" stop-color="#b80b6e"/>
    </radialGradient>
    <linearGradient id="steel" x1="16%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="18%" stop-color="#cbd5df"/>
      <stop offset="44%" stop-color="#59616d"/>
      <stop offset="70%" stop-color="#f7fafc"/>
      <stop offset="100%" stop-color="#424955"/>
    </linearGradient>
    <linearGradient id="pinGloss" x1="8%" y1="0%" x2="82%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="44%" stop-color="#ffffff" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="pinShadow" x="-30%" y="-30%" width="170%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#7f1d5a" flood-opacity="0.18"/>
    </filter>
    <filter id="grayBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <g transform="rotate(-29 256 256)" filter="url(#pinShadow)">
    <ellipse cx="258" cy="438" rx="115" ry="26" fill="#111827" opacity="0.12" filter="url(#grayBlur)"/>
    <path d="M244 305h32l-11 176c-1 15-16 24-28 16-7-5-10-13-8-22l15-170Z" fill="url(#steel)"/>
    <path d="M259 310l-9 157" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.55"/>
    <ellipse cx="260" cy="289" rx="106" ry="56" fill="url(#pinPink)"/>
    <ellipse cx="260" cy="282" rx="88" ry="38" fill="#ff5bb8" opacity="0.32"/>
    <path d="M168 280c19-31 105-46 165-24" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="13" stroke-linecap="round"/>
    <rect x="215" y="139" width="90" height="156" rx="39" fill="url(#pinPink)"/>
    <path d="M232 158c26-20 58-13 66 12" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="12" stroke-linecap="round"/>
    <path d="M237 204c18 40 55 43 67 10v58c-14 21-53 22-67 0v-68Z" fill="#a80867" opacity="0.18"/>
    <ellipse cx="260" cy="123" rx="112" ry="62" fill="url(#pinPink)"/>
    <ellipse cx="260" cy="112" rx="88" ry="42" fill="#ff62be" opacity="0.34"/>
    <path d="M171 111c26-38 113-52 175-25" fill="none" stroke="#ffffff" stroke-opacity="0.62" stroke-width="14" stroke-linecap="round"/>
    <path d="M206 93c32-19 81-20 113-4" fill="none" stroke="url(#pinGloss)" stroke-width="20" stroke-linecap="round" opacity="0.75"/>
    <path d="M336 140c-18 36-78 55-139 36" fill="none" stroke="#9f075f" stroke-opacity="0.16" stroke-width="15" stroke-linecap="round"/>
  </g>
</svg>`)} `;

const imageSrcOverrides: Record<string, string> = {
  "/images/section-headers/heart-3d.png": HEART_HEADER_IMAGE.trim(),
  "/images/section-headers/pin-3d.png": PIN_HEADER_IMAGE.trim(),
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
          "relative z-50 max-w-[calc(100%-10.75rem)] pr-2 sm:max-w-[calc(100%-14.75rem)] sm:pr-4 md:max-w-[calc(100%-19.5rem)] md:pr-6",
          contentClassName,
        )}
      >
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
          className="absolute bottom-5 left-5 z-[60] flex max-w-[calc(100%-10.75rem)] items-center justify-start gap-2 sm:left-7 sm:max-w-[calc(100%-14.75rem)] md:max-w-[calc(100%-19.5rem)]"
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
