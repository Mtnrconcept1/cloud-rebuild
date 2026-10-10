import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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

export default function SectionShowcaseHeader({
  title, subtitle, icon: Icon, linkText, linkTo, className, actions,
}: SectionShowcaseHeaderProps) {
  return (
    <div data-section-showcase-header className={cn("flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5", className)}>
      <div className="min-w-0 max-w-3xl">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />{subtitle}
        </p>
        <h2 className="font-display text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl md:text-4xl">{title}</h2>
      </div>
      {(actions || (linkText && linkTo)) ? (
        <div data-section-action-row className="flex max-w-full flex-wrap items-center gap-2">
          {actions}
          {linkText && linkTo ? (
            <Button variant="ghost" className="min-h-11 rounded-full px-3 text-sm text-primary" asChild>
              <Link to={linkTo}><span>{linkText}</span><ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden="true" /></Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
