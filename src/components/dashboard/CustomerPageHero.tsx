import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { getCustomerDashboardVisual, getTokHeroStyle } from "@/lib/dashboardVisuals";
import { BarChart3, ChevronRight } from "lucide-react";
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
  const contextLabel = breadcrumb || "Mon espace";

  return (
    <div className="tok-customer-hero-row" data-compact={pathname !== "/mon-espace"}>
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
      {visual ? (
        <aside className="tok-customer-hero-sidecar" aria-label={`Aperçu ${contextLabel}`}>
          <div className="tok-customer-hero-sidecar__heading">
            <div>
              <p>Votre espace</p>
              <strong>Console active</strong>
            </div>
            <span aria-hidden="true"><BarChart3 /></span>
          </div>
          <div className="tok-customer-hero-sidecar__context">
            <span>Page</span>
            <strong>{contextLabel}</strong>
          </div>
          <img src={visual.illustration} loading="eager" decoding="async" alt="" />
        </aside>
      ) : null}
    </div>
  );
}
