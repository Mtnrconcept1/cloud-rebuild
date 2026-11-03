import type { ComponentType, ReactNode } from "react";
import type { DashboardIllustration } from "@/lib/dashboardIllustrations";
import PageHeading from "@/components/editorial/PageHeading";

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

export default function DashboardPageHero({
  badge, title, description, icon: Icon, actions, stats = [], visualLabel,
  className,
}: DashboardPageHeroProps) {
  return (
    <section className={className}>
      <PageHeading
        title={title}
        eyebrow={badge}
        description={description}
        actions={actions}
      />
      {stats.length > 0 && (
        <dl className="tok-editorial-stats" aria-label={visualLabel || "Indicateurs"}>
          {stats.map(({ label, value, icon: StatIcon = Icon }) => (
            <div className="tok-editorial-stat" key={label}>
              <div><dt>{label}</dt><dd>{value}</dd></div>
              <StatIcon className="ml-auto h-5 w-5" aria-hidden="true" />
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
