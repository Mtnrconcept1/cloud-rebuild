import type { ComponentType, ReactNode } from "react";
import type { DashboardIllustration } from "@/lib/dashboardIllustrations";
import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import { ArrowRight, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardHeroTone = "orange" | "sky" | "emerald" | "amber" | "violet" | "rose" | "primary";

type DashboardHeroStat = {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
};

const HERO_TONES: Record<DashboardHeroTone, {
  toneClass: string;
  line: string;
  glow: string;
}> = {
  orange: {
    toneClass: "tok-tone-orange",
    line: "from-[#ff6a1a] via-[#ff9f1c] to-[#4cf6d3]",
    glow: "shadow-[0_0_44px_rgba(255,106,26,0.28)]",
  },
  primary: {
    toneClass: "tok-tone-primary",
    line: "from-[#ff6a1a] via-[#ff9f1c] to-[#4cf6d3]",
    glow: "shadow-[0_0_44px_rgba(255,106,26,0.28)]",
  },
  sky: {
    toneClass: "tok-tone-sky",
    line: "from-[#22a3ff] via-[#6dc9ff] to-[#ff9f1c]",
    glow: "shadow-[0_0_44px_rgba(34,163,255,0.24)]",
  },
  emerald: {
    toneClass: "tok-tone-emerald",
    line: "from-[#4cf6d3] via-[#22c55e] to-[#ff9f1c]",
    glow: "shadow-[0_0_44px_rgba(76,246,211,0.22)]",
  },
  amber: {
    toneClass: "tok-tone-amber",
    line: "from-[#ffb02a] via-[#ff6a1a] to-[#8ec7ff]",
    glow: "shadow-[0_0_44px_rgba(255,176,42,0.24)]",
  },
  violet: {
    toneClass: "tok-tone-violet",
    line: "from-[#a864ff] via-[#4679ff] to-[#ff9f1c]",
    glow: "shadow-[0_0_44px_rgba(168,100,255,0.22)]",
  },
  rose: {
    toneClass: "tok-tone-rose",
    line: "from-[#ff4c79] via-[#ff6a1a] to-[#8ec7ff]",
    glow: "shadow-[0_0_44px_rgba(255,76,121,0.22)]",
  },
};

type DashboardPageHeroProps = {
  badge: string;
  title: ReactNode;
  description: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: DashboardHeroTone;
  actions?: ReactNode;
  stats?: DashboardHeroStat[];
  visualLabel?: string;
  illustration?: DashboardIllustration;
  compact?: boolean;
  className?: string;
};

export default function DashboardPageHero({
  badge,
  title,
  description,
  icon: Icon,
  tone = "orange",
  actions,
  stats = [],
  visualLabel = "Pilotage",
  illustration,
  compact = false,
  className,
}: DashboardPageHeroProps) {
  const toneClasses = HERO_TONES[tone];
  const displayStats = stats.slice(0, 3);

  return (
    <Card className={cn("tok-dashboard-hero rounded-3xl border border-border/70", className)}>
      <CardContent className={cn("relative p-5 sm:p-7 lg:p-8", compact && "p-4 sm:p-5 lg:p-6")}>
        <div className={cn("grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]", compact && "gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)]")}>
          <div className={cn("relative z-10 min-w-0 space-y-6", compact && "space-y-3")}>
            <Badge
              variant="outline"
              className={cn("rounded-full border-primary/45 bg-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-primary dark:border-[#2d69b8]/70 dark:bg-[#071c3c]/75 dark:text-[#8ec7ff] dark:shadow-[0_0_28px_rgba(30,105,216,0.22)]", compact && "px-3 py-1.5")}
            >
              {badge}
            </Badge>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className={cn("tok-kpi-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20", toneClasses.toneClass, compact && "h-12 w-12 sm:h-14 sm:w-14")}>
                <Icon className={cn("h-8 w-8", compact && "h-6 w-6")} />
              </div>
              <div className="min-w-0 space-y-3">
                <h1 className={cn("font-display text-3xl font-bold leading-tight tracking-tight text-foreground dark:text-white sm:text-5xl", compact && "text-2xl sm:text-3xl")}>
                  {title}
                </h1>
                <p className={cn("max-w-3xl text-sm leading-7 text-muted-foreground dark:text-slate-100/80 sm:text-base", compact && "leading-6")}>
                  {description}
                </p>
              </div>
            </div>
            {actions ? <div className="tok-action-row flex flex-wrap gap-3">{actions}</div> : null}
            {illustration ? (
              <DashboardIllustrationMedia
                eager
                illustration={illustration}
                className={cn("mx-auto h-24 w-24 lg:hidden", compact && "h-20 w-20")}
              />
            ) : null}
          </div>

          <div className="pointer-events-none relative z-10 hidden lg:block">
            <div className={cn("absolute inset-x-2 top-0 h-1 rounded-full bg-gradient-to-r", toneClasses.line)} />
            <div className={cn(
              "relative mt-6 w-full rounded-3xl border border-[#6b7da7]/35 bg-white/80 p-5 backdrop-blur dark:bg-[#07142b]/74",
              compact && "mt-3 p-3",
              "dark:shadow-[0_26px_74px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.08)]",
              toneClasses.glow,
            )}>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className={cn("tok-kpi-label text-[11px] font-bold uppercase tracking-[0.24em]", toneClasses.toneClass)}>{visualLabel}</p>
                  <p className="text-sm font-semibold text-foreground dark:text-white">Console active</p>
                </div>
                <div className={cn("tok-kpi-icon flex h-12 w-12 items-center justify-center rounded-2xl", toneClasses.toneClass)}>
                  <BarChart3 className="h-5 w-5" />
                </div>
              </div>

              <div className={cn("mt-5", compact && "mt-3", illustration && "grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3")}>
                <div className={cn("space-y-3", compact && "space-y-2")}>
                {displayStats.length > 0 ? displayStats.map((stat) => {
                  const StatIcon = stat.icon ?? ArrowRight;

                  return (
                    <div key={stat.label} className={cn("tok-dashboard-kpi flex items-center justify-between gap-3 rounded-2xl px-4 py-3", toneClasses.toneClass, compact && "px-3 py-2")}>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-100/62">{stat.label}</p>
                        <p className="tok-kpi-value truncate text-lg font-bold">{stat.value}</p>
                      </div>
                      <StatIcon className="h-4 w-4 shrink-0 text-[rgb(var(--tok-accent-rgb))]" />
                    </div>
                  );
                }) : (
                  <div className={cn("tok-dashboard-kpi rounded-2xl px-4 py-4", toneClasses.toneClass)}>
                    <p className="tok-kpi-value text-lg font-bold">Vue prête</p>
                    <p className="text-xs text-muted-foreground dark:text-slate-100/64">Les données utiles restent au premier plan.</p>
                  </div>
                )}
                </div>

                {illustration ? (
                  <DashboardIllustrationMedia
                    eager
                    illustration={illustration}
                    className={cn("h-28 w-28", compact && "h-24 w-24")}
                  />
                ) : (
                <div className="mt-5 grid grid-cols-5 items-end gap-2">
                  {[42, 64, 52, 76, 58].map((height, index) => (
                    <span
                      key={`${height}-${index}`}
                      className={cn("rounded-t bg-gradient-to-t shadow-[0_0_18px_rgba(255,106,26,0.28)]", toneClasses.line)}
                      style={{ height: `${height}px`, opacity: 0.56 + index * 0.08 }}
                    />
                  ))}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
