import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { getCustomerDashboardVisual, getTokHeroStyle } from "@/lib/dashboardVisuals";
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
  const { pathname, search } = useLocation();
  const visual = getCustomerDashboardVisual(pathname, search);
  return (
    <div className="tok-customer-hero-row">
    <header className={cn("tok-customer-page-hero", className)} style={getTokHeroStyle(visual?.hero)}>
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
    {visual ? <aside className="tok-customer-hero-sidecar" aria-label="Illustration de votre espace TOK"><img src={visual.illustration} loading="lazy" alt="" /></aside> : null}
    </div>
  );
}
