import type { ReactNode } from "react";
import PageHeading from "@/components/editorial/PageHeading";
import "./CustomerWorkspacePages.css";

type CustomerPageHeroProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  breadcrumb?: string;
  actions?: ReactNode;
  className?: string;
};

export default function CustomerPageHero({ title, subtitle, description, breadcrumb, actions, className }: CustomerPageHeroProps) {
  return (
    <PageHeading title={title} eyebrow={breadcrumb} actions={actions} className={className}
      description={subtitle || description ? <>{subtitle && <p>{subtitle}</p>}{description && <p>{description}</p>}</> : undefined}
    />
  );
}
