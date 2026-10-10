import type { ComponentType, ReactNode } from "react";
import type { DashboardIllustration } from "@/lib/dashboardIllustrations";
import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import { cn } from "@/lib/utils";

type DashboardHeroTone = "orange" | "sky" | "emerald" | "amber" | "violet" | "rose" | "primary";
type DashboardHeroStat = {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
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

/** A working page starts with its purpose and actions; decoration never displaces its data. */
export default function DashboardPageHero({
  badge,
  title,
  description,
  icon: Icon,
  tone = "orange",
  actions,
  stats = [],
  visualLabel = "En bref",
  illustration,
  compact = false,
  className,
}: DashboardPageHeroProps) {
  return (
    <header className={cn("tok-tool-header rounded-2xl border border-border bg-card text-card-foreground", className)} data-tone={tone}>
      <div className={cn("flex items-start gap-4 p-5 sm:p-6", compact && "p-4 sm:p-5")}>
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {badge}
          </p>
          <h1 className="font-sans text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
          {actions ? <div className="tok-action-row mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {illustration ? (
          <div className="hidden shrink-0 sm:block" aria-hidden="true">
            <DashboardIllustrationMedia illustration={illustration} className="h-16 w-16" />
          </div>
        ) : null}
      </div>
      {stats.length > 0 ? (
        <dl aria-label={visualLabel} className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex sm:flex-wrap sm:gap-x-8 sm:px-6">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 sm:min-w-28 sm:flex-1">
              <dt className="flex items-center gap-1.5 text-xs font-medium leading-relaxed text-muted-foreground">
                {stat.icon ? <stat.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                {stat.label}
              </dt>
              <dd className="mt-1 break-words text-base font-semibold tabular-nums text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
