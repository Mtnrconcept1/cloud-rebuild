import { ArrowRight, BarChart3, Calculator, Coins } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AccountingTone = "slate" | "sky" | "emerald" | "amber" | "orange" | "violet" | "rose" | "primary";

const TONE_CLASSES: Record<AccountingTone, {
  card: string;
  value: string;
  label: string;
  icon: string;
  soft: string;
  glow: string;
}> = {
  slate: {
    card: "tok-dashboard-panel tok-tone-slate",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-slate",
    glow: "tok-tone-overlay",
  },
  sky: {
    card: "tok-dashboard-panel tok-tone-sky",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-sky",
    glow: "tok-tone-overlay",
  },
  emerald: {
    card: "tok-dashboard-panel tok-tone-emerald",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-emerald",
    glow: "tok-tone-overlay",
  },
  amber: {
    card: "tok-dashboard-panel tok-tone-amber",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-amber",
    glow: "tok-tone-overlay",
  },
  orange: {
    card: "tok-dashboard-panel tok-tone-orange",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-orange",
    glow: "tok-tone-overlay",
  },
  violet: {
    card: "tok-dashboard-panel tok-tone-violet",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-violet",
    glow: "tok-tone-overlay",
  },
  rose: {
    card: "tok-dashboard-panel tok-tone-rose",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-rose",
    glow: "tok-tone-overlay",
  },
  primary: {
    card: "tok-dashboard-panel tok-tone-primary",
    value: "tok-kpi-value",
    label: "tok-kpi-label",
    icon: "tok-kpi-icon",
    soft: "tok-dashboard-kpi tok-tone-primary",
    glow: "tok-tone-overlay",
  },
};

type AccountingHeroProps = {
  badge: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function AccountingHero({
  badge,
  title,
  description,
  actions,
  className,
}: AccountingHeroProps) {
  const adminTitleMatch = title.match(/^(.*)\s(admin)$/i);

  return (
    <Card className={cn("tok-dashboard-hero rounded-3xl border border-border/70", className)}>
      <CardContent className="relative flex flex-col gap-6 p-6 sm:p-8 lg:min-h-[20rem] lg:flex-row lg:items-center lg:justify-between">
        <div className="relative z-10 max-w-3xl space-y-6">
          <Badge variant="outline" className="rounded-full border-primary/45 bg-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-primary dark:border-[#2d69b8]/70 dark:bg-[#071c3c]/75 dark:text-[#8ec7ff] dark:shadow-[0_0_28px_rgba(30,105,216,0.22)]">
            {badge}
          </Badge>
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground dark:text-white sm:text-5xl">
              {adminTitleMatch ? (
                <>
                  {adminTitleMatch[1]} <span className="text-[#ff6a1a]">{adminTitleMatch[2]}</span>
                </>
              ) : title}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground dark:text-slate-100/80">{description}</p>
          </div>
          {actions ? (
            <div className="tok-action-row flex flex-wrap gap-3">
              {actions}
            </div>
          ) : null}
        </div>
        <div className="pointer-events-none relative z-0 hidden h-56 w-72 shrink-0 items-center justify-center lg:flex">
          <div className="absolute right-0 top-4 h-40 w-48 rotate-6 rounded-3xl border border-[#6b7da7]/35 bg-[#10204a]/75 shadow-[0_24px_72px_rgba(0,0,0,0.42),0_0_44px_rgba(30,105,216,0.24)]" />
          <div className="absolute right-9 top-12 h-24 w-36 rotate-6 rounded-2xl border border-[#5c74ad]/40 bg-[#07142b]/64 p-4">
            <BarChart3 className="absolute left-5 top-5 h-8 w-8 text-sky-200/80" />
            <div className="absolute bottom-5 left-5 flex items-end gap-2">
              {[30, 46, 36, 58, 76].map((height, index) => (
                <span
                  key={height}
                  className="w-4 rounded-t bg-gradient-to-t from-[#2437bc] via-[#8c55ff] to-[#ff8f22] shadow-[0_0_18px_rgba(255,106,26,0.45)]"
                  style={{ height: `${height}px`, opacity: 0.62 + index * 0.07 }}
                />
              ))}
            </div>
          </div>
          <div className="absolute bottom-3 right-2 flex h-20 w-20 items-center justify-center rounded-full border border-[#ff9f1c]/50 bg-[#ff6a1a]/20 text-orange-100 shadow-[0_0_40px_rgba(255,106,26,0.50)]">
            <Coins className="h-8 w-8" />
          </div>
          <div className="absolute left-2 top-14 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#6b7da7]/35 bg-white/10 text-sky-100">
            <Calculator className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type AccountingMetricCardProps = {
  label: string;
  value: string;
  description: string;
  tone?: AccountingTone;
  icon?: LucideIcon;
  className?: string;
};

export function AccountingMetricCard({
  label,
  value,
  description,
  tone = "slate",
  icon: Icon,
  className,
}: AccountingMetricCardProps) {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <Card className={cn("h-full overflow-hidden rounded-2xl", toneClasses.card, className)}>
      <CardContent className="relative space-y-4 p-5">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-100", toneClasses.glow)} />
        <div className="flex items-start justify-between gap-3">
          <div className="relative z-10 space-y-1">
            <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", toneClasses.label)}>{label}</p>
            <p className={cn("text-3xl font-bold tracking-tight sm:text-4xl", toneClasses.value)}>{value}</p>
          </div>
          {Icon ? (
            <div className={cn("relative z-10 rounded-2xl p-3", toneClasses.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
        <p className={cn("relative z-10 text-sm leading-6", toneClasses.label)}>{description}</p>
      </CardContent>
    </Card>
  );
}

type AccountingDigestItem = {
  label: string;
  value: string;
  helper?: string;
  tone?: AccountingTone;
  icon?: LucideIcon;
};

type AccountingDigestCardProps = {
  title: string;
  description?: string;
  items: AccountingDigestItem[];
  actions?: ReactNode;
  className?: string;
};

export function AccountingDigestCard({
  title,
  description,
  items,
  actions,
  className,
}: AccountingDigestCardProps) {
  return (
    <Card className={cn("tok-dashboard-section rounded-3xl border border-border/70", className)}>
      <CardHeader className="space-y-2 pb-4 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-display text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl">{title}</CardTitle>
            {description ? <CardDescription className="max-w-3xl text-base leading-7 dark:text-slate-100/78">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="sm:px-7 sm:pb-7">
        <div className="space-y-4">
          {items.map((item) => {
            const toneClasses = TONE_CLASSES[item.tone ?? "slate"];
            const Icon = item.icon;

            return (
              <div
                key={`${item.label}-${item.value}`}
                className={cn("relative min-w-0 overflow-hidden rounded-2xl border px-4 py-4 sm:px-6 sm:py-5", toneClasses.soft)}
              >
                <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-100", toneClasses.glow)} />
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    {Icon ? (
                      <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16", toneClasses.icon)}>
                        <Icon className="h-7 w-7" />
                      </div>
                    ) : null}
                    <div className="min-w-0 space-y-1.5">
                      <p className={cn("text-xs font-bold uppercase tracking-[0.22em]", toneClasses.label)}>{item.label}</p>
                      <p className={cn("break-words text-3xl font-bold tracking-tight text-balance sm:text-4xl", toneClasses.value)}>{item.value}</p>
                      {item.helper ? <p className="text-sm leading-6 text-muted-foreground dark:text-slate-100/76">{item.helper}</p> : null}
                    </div>
                  </div>
                  <div className={cn("hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:flex", toneClasses.icon)}>
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type AccountingPanelProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  value?: string;
  valueLabel?: string;
  tone?: AccountingTone;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
};

export function AccountingPanel({
  title,
  description,
  eyebrow,
  value,
  valueLabel,
  tone = "slate",
  icon: Icon,
  children,
  className,
}: AccountingPanelProps) {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <Card className={cn("h-full overflow-hidden rounded-3xl", toneClasses.card, className)}>
      <CardHeader className="relative space-y-4 pb-4">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-100", toneClasses.glow)} />
        {eyebrow ? <p className={cn("relative z-10 text-[11px] font-bold uppercase tracking-[0.25em]", toneClasses.label)}>{eyebrow}</p> : null}
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {Icon ? (
                <div className={cn("rounded-2xl p-3", toneClasses.icon)}>
                  <Icon className="h-5 w-5" />
                </div>
              ) : null}
              <CardTitle className="text-xl font-bold tracking-tight text-foreground dark:text-white">{title}</CardTitle>
            </div>
            {description ? <CardDescription className="max-w-2xl text-sm leading-7 dark:text-slate-100/78">{description}</CardDescription> : null}
          </div>
          {value ? (
            <div className="space-y-1 text-left lg:text-right">
              {valueLabel ? <p className={cn("text-xs font-bold uppercase tracking-[0.22em]", toneClasses.label)}>{valueLabel}</p> : null}
              <p className={cn("text-3xl font-bold tracking-tight sm:text-4xl", toneClasses.value)}>{value}</p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      {children ? <CardContent className="relative z-10 space-y-4">{children}</CardContent> : null}
    </Card>
  );
}

type AccountingFact = {
  label: string;
  value: string;
  helper?: string;
};

type AccountingFactListProps = {
  items: AccountingFact[];
  tone?: AccountingTone;
  className?: string;
};

export function AccountingFactList({
  items,
  tone = "slate",
  className,
}: AccountingFactListProps) {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <div className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className={cn("flex min-w-0 flex-col gap-2 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4", toneClasses.soft)}>
          <div className="min-w-0 space-y-1">
            <p className={cn("text-sm font-semibold leading-5", toneClasses.value)}>{item.label}</p>
            {item.helper ? <p className="text-xs leading-5 text-muted-foreground dark:text-slate-200/75">{item.helper}</p> : null}
          </div>
          <div className={cn("break-words text-sm font-bold sm:whitespace-nowrap", toneClasses.value)}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
