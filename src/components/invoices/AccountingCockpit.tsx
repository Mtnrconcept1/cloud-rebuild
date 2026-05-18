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
}> = {
  slate: {
    card: "border-border/70 bg-card dark:border-white/20 dark:bg-slate-950/90 dark:shadow-[0_0_34px_rgba(148,163,184,0.10)]",
    value: "text-foreground dark:text-white",
    label: "text-muted-foreground dark:text-slate-200/90",
    icon: "bg-muted text-foreground dark:bg-white/10 dark:text-slate-100",
    soft: "border-border/70 bg-muted/30 dark:border-white/20 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  },
  sky: {
    card: "border-sky-200 bg-sky-50/80 dark:border-sky-300/25 dark:bg-sky-950/30 dark:shadow-[0_0_36px_rgba(14,165,233,0.12)]",
    value: "text-sky-950 dark:text-sky-50",
    label: "text-sky-800 dark:text-sky-100/90",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-300/20 dark:text-sky-100",
    soft: "border-sky-200 bg-background/90 dark:border-sky-300/20 dark:bg-sky-950/40",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-300/25 dark:bg-emerald-950/30 dark:shadow-[0_0_36px_rgba(16,185,129,0.14)]",
    value: "text-emerald-950 dark:text-emerald-50",
    label: "text-emerald-800 dark:text-emerald-100/90",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-300/20 dark:text-emerald-100",
    soft: "border-emerald-200 bg-background/90 dark:border-emerald-300/20 dark:bg-emerald-950/40",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/80 dark:border-amber-300/30 dark:bg-amber-950/30 dark:shadow-[0_0_38px_rgba(245,158,11,0.15)]",
    value: "text-amber-950 dark:text-amber-50",
    label: "text-amber-900 dark:text-amber-100/90",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-300/20 dark:text-amber-100",
    soft: "border-amber-200 bg-background/90 dark:border-amber-300/20 dark:bg-amber-950/40",
  },
  orange: {
    card: "border-orange-200 bg-orange-50/80 dark:border-orange-300/30 dark:bg-orange-950/30 dark:shadow-[0_0_38px_rgba(249,115,22,0.16)]",
    value: "text-orange-950 dark:text-orange-50",
    label: "text-orange-900 dark:text-orange-100/90",
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-300/20 dark:text-orange-100",
    soft: "border-orange-200 bg-background/90 dark:border-orange-300/20 dark:bg-orange-950/40",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/80 dark:border-violet-300/25 dark:bg-violet-950/30 dark:shadow-[0_0_38px_rgba(139,92,246,0.16)]",
    value: "text-violet-950 dark:text-violet-50",
    label: "text-violet-800 dark:text-violet-100/90",
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-300/20 dark:text-violet-100",
    soft: "border-violet-200 bg-background/90 dark:border-violet-300/20 dark:bg-violet-950/40",
  },
  rose: {
    card: "border-rose-200 bg-rose-50/80 dark:border-rose-300/25 dark:bg-rose-950/30 dark:shadow-[0_0_38px_rgba(244,63,94,0.15)]",
    value: "text-rose-950 dark:text-rose-50",
    label: "text-rose-800 dark:text-rose-100/90",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-300/20 dark:text-rose-100",
    soft: "border-rose-200 bg-background/90 dark:border-rose-300/20 dark:bg-rose-950/40",
  },
  primary: {
    card: "border-primary/20 bg-primary/5 dark:border-orange-300/30 dark:bg-orange-950/30 dark:shadow-[0_0_38px_rgba(249,115,22,0.16)]",
    value: "text-primary dark:text-orange-50",
    label: "text-primary dark:text-orange-100/90",
    icon: "bg-primary/10 text-primary dark:bg-orange-300/20 dark:text-orange-100",
    soft: "border-primary/20 bg-background/90 dark:border-orange-300/20 dark:bg-orange-950/40",
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
  return (
    <Card className={cn("overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/30", className)}>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
            {badge}
          </Badge>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
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
    <Card className={cn("h-full", toneClasses.card, className)}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className={cn("text-sm font-medium", toneClasses.label)}>{label}</p>
            <p className={cn("text-3xl font-bold tracking-tight", toneClasses.value)}>{value}</p>
          </div>
          {Icon ? (
            <div className={cn("rounded-full p-2.5", toneClasses.icon)}>
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
        </div>
        <p className={cn("text-sm leading-6", toneClasses.label)}>{description}</p>
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
    <Card className={cn("border-border/70 bg-card", className)}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
            {description ? <CardDescription className="max-w-3xl leading-6">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const toneClasses = TONE_CLASSES[item.tone ?? "slate"];
            const Icon = item.icon;

            return (
              <div
                key={`${item.label}-${item.value}`}
                className={cn("min-w-0 rounded-lg border px-3 py-3", toneClasses.soft)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className={cn("text-xs font-medium uppercase tracking-wide", toneClasses.label)}>{item.label}</p>
                    <p className={cn("break-words text-2xl font-bold tracking-tight", toneClasses.value)}>{item.value}</p>
                  </div>
                  {Icon ? (
                    <div className={cn("rounded-md p-2", toneClasses.icon)}>
                      <Icon className="h-4 w-4" />
                    </div>
                  ) : null}
                </div>
                {item.helper ? <p className="mt-2 text-xs leading-5 text-muted-foreground dark:text-slate-200/75">{item.helper}</p> : null}
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
    <Card className={cn("h-full", toneClasses.card, className)}>
      <CardHeader className="space-y-4 pb-4">
        {eyebrow ? <p className={cn("text-[11px] uppercase tracking-[0.25em]", toneClasses.label)}>{eyebrow}</p> : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {Icon ? (
                <div className={cn("rounded-full p-2.5", toneClasses.icon)}>
                  <Icon className="h-4 w-4" />
                </div>
              ) : null}
              <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
            </div>
            {description ? <CardDescription className="max-w-2xl leading-6">{description}</CardDescription> : null}
          </div>
          {value ? (
            <div className="space-y-1 text-left lg:text-right">
              {valueLabel ? <p className={cn("text-xs uppercase tracking-[0.22em]", toneClasses.label)}>{valueLabel}</p> : null}
              <p className={cn("text-3xl font-bold tracking-tight", toneClasses.value)}>{value}</p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      {children ? <CardContent className="space-y-4">{children}</CardContent> : null}
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
        <div key={`${item.label}-${item.value}`} className={cn("flex items-start justify-between gap-4 rounded-xl border px-3 py-3", toneClasses.soft)}>
          <div className="min-w-0 space-y-1">
            <p className={cn("text-sm font-semibold leading-5", toneClasses.value)}>{item.label}</p>
            {item.helper ? <p className="text-xs leading-5 text-muted-foreground dark:text-slate-200/75">{item.helper}</p> : null}
          </div>
          <div className={cn("whitespace-nowrap text-sm font-bold", toneClasses.value)}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
