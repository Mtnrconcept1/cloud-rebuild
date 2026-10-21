import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import "./CustomerWorkspacePages.css";

type CustomerPageHeroProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  breadcrumb?: string;
  actions?: ReactNode;
  className?: string;
};

/** The photograph is decorative; all account information comes from the page. */
export default function CustomerPageHero({
  title,
  subtitle,
  description,
  breadcrumb,
  actions,
  className,
}: CustomerPageHeroProps) {
  return (
    <header className={cn("tok-customer-page-hero", className)}>
      <div className="tok-customer-page-hero__copy">
        <p className="tok-customer-page-hero__eyebrow">
          <span>Accueil</span>
          {breadcrumb ? <><ChevronRight aria-hidden="true" /><span>{breadcrumb}</span></> : null}
        </p>
        <h1>{title}</h1>
        {subtitle ? <p className="tok-customer-page-hero__subtitle">{subtitle}</p> : null}
        {description ? <p className="tok-customer-page-hero__description">{description}</p> : null}
        {actions ? <div className="tok-customer-page-hero__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
