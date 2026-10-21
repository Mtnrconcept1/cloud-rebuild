import { useEffect, useId, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Group every existing destination without making the sidebar an endless list. */
export default function WorkspaceNavigationSection({ title, icon: Icon, active, collapsed = false, children }: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { if (active) setExpanded(true); }, [active]);

  if (collapsed) return <div className="tok-workspace-nav-section">{children}</div>;

  return (
    <section className="tok-workspace-nav-section">
      <button type="button" className="tok-workspace-nav-heading" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={id} hidden={!expanded} className="tok-workspace-nav-items">{children}</div>
    </section>
  );
}
