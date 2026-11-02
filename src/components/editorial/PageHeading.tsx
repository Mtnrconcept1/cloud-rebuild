import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./editorial.css";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  artwork?: ReactNode;
  className?: string;
};

export default function PageHeading({ title, description, eyebrow, actions, artwork, className }: Props) {
  return (
    <header className={cn("tok-editorial-heading", className)}>
      <div className="tok-editorial-heading__copy">
        {eyebrow && <div className="tok-editorial-heading__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <div className="tok-editorial-heading__description">{description}</div>}
      </div>
      {artwork && <div className="tok-editorial-heading__art" aria-hidden="true">{artwork}</div>}
      {actions && <div className="tok-editorial-heading__actions">{actions}</div>}
    </header>
  );
}
