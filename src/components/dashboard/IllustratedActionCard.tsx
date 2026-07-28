import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import type { DashboardIllustration } from "@/lib/dashboardIllustrations";
import { cn } from "@/lib/utils";

type IllustratedActionCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  illustration: DashboardIllustration;
  meta?: ReactNode;
  className?: string;
  to?: string;
  onClick?: () => void;
};

function IllustratedActionCardContent({ title, description, icon: Icon, illustration, meta }: IllustratedActionCardProps) {
  return (
    <>
      <span className="relative z-10 flex min-w-0 flex-col self-stretch">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 transition group-hover:bg-orange-600 group-hover:text-white group-hover:ring-orange-600 dark:bg-orange-500/10 dark:ring-orange-400/20">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <span role="heading" aria-level={2} className="mt-4 block text-lg font-bold leading-tight text-foreground">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-muted-foreground">{description}</span>
        {meta ? <span className="mt-auto pt-4">{meta}</span> : null}
      </span>
      <DashboardIllustrationMedia
        illustration={illustration}
        className="min-h-32 w-full overflow-visible bg-transparent"
        imageClassName="transition duration-300 group-hover:-translate-y-1 group-hover:rotate-1"
        fallbackClassName="mx-auto h-20 w-20 rounded-[1.75rem]"
      />
    </>
  );
}

export default function IllustratedActionCard(props: IllustratedActionCardProps) {
  const className = cn(
    "group grid min-h-[184px] w-full grid-cols-[minmax(0,1fr)_6.75rem] items-center gap-3 overflow-hidden rounded-[28px] border border-orange-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,247,237,0.82))] p-5 text-left shadow-[0_18px_46px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-[0_24px_58px_rgba(249,115,22,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-orange-400/20 dark:bg-background min-[380px]:grid-cols-[minmax(0,1fr)_8rem] sm:min-h-[218px]",
    props.className,
  );
  const content = <IllustratedActionCardContent {...props} />;

  if (props.to) return <Link to={props.to} className={className}>{content}</Link>;

  return <button type="button" onClick={props.onClick} className={className}>{content}</button>;
}
