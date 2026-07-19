import { useState } from "react";
import {
  Bike,
  BriefcaseBusiness,
  Check,
  LayoutDashboard,
  Shield,
  Store,
  User,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { getAdminNavigationHref } from "@/lib/adminDomains";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
import {
  DEMO_WORKSPACES,
  getDemoMultiWorkspaceHref,
  getDemoWorkspaceHref,
  isDemoWorkspaceSurface,
  type DemoWorkspaceSurface,
} from "@/lib/demoWorkspaces";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getFeatureVisibleRoles, getRoleHomePath } from "@/lib/roleAccess";
import { cn } from "@/lib/utils";

type RoleSpaceMenuSectionProps = {
  className?: string;
  itemClassName?: string;
  title?: string;
  onNavigate?: () => void;
};

type RoleMenuItem = {
  label: string;
  description: string;
  icon: LucideIcon;
};

type AccessMode = "real" | "demo";

const ROLE_MENU_ITEMS: Record<UserRole, RoleMenuItem> = {
  client: {
    label: "Espace client",
    description: "Commandes, réservations et profil",
    icon: User,
  },
  restaurateur: {
    label: "Dashboard restaurateur",
    description: "Restaurant, opérations et marketing",
    icon: Store,
  },
  admin: {
    label: "Dashboard admin",
    description: "Supervision plateforme TOK",
    icon: Shield,
  },
  courier: {
    label: "Espace livreur",
    description: "Missions, gains et profil",
    icon: Bike,
  },
  commercial: {
    label: "Espace commercial",
    description: "Prospection, signatures et revenus",
    icon: BriefcaseBusiness,
  },
};

const DEMO_ICONS: Record<DemoWorkspaceSurface, LucideIcon> = {
  client: User,
  restaurant: Store,
  courier: Bike,
};

function getRoleTarget(role: UserRole) {
  if (role === "admin") return getAdminNavigationHref("/admin");
  if (role === "commercial") return getCommercialNavigationHref("/commercial");
  return getRoleHomePath(role);
}

export default function RoleSpaceMenuSection({
  className,
  itemClassName,
  title = "Mes espaces",
  onNavigate,
}: RoleSpaceMenuSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, roles, canSwitchRole, switchRole } = useAuth();
  const resolvedRoles = roles ?? [];
  const activeFeatures = useActiveFeatures();
  const switchableRoles = getFeatureVisibleRoles(roles, activeFeatures);
  const isAdmin = resolvedRoles.includes("admin");
  const isCommercial = resolvedRoles.includes("commercial");
  const hasDemoAccess = isAdmin || isCommercial;
  const hasMultipleRealSpaces = canSwitchRole && switchableRoles.length >= 2;
  const [accessMode, setAccessMode] = useState<AccessMode>("real");

  if (!hasDemoAccess && !hasMultipleRealSpaces) return null;

  const activeRole = role && switchableRoles.includes(role) ? role : switchableRoles[0];
  const requestedSurface = new URLSearchParams(location.search).get("surface");

  const handleRoleSelect = (nextRole: UserRole) => {
    switchRole(nextRole);
    onNavigate?.();

    const target = getRoleTarget(nextRole);
    if (/^https?:\/\//.test(target)) {
      window.location.assign(target);
      return;
    }

    navigate(target);
  };

  const handleDemoSelect = (surface: DemoWorkspaceSurface) => {
    onNavigate?.();
    const target = getDemoWorkspaceHref(surface);
    if (/^https?:\/\//.test(target)) {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  const handleMultiDemoSelect = () => {
    onNavigate?.();
    const target = getDemoMultiWorkspaceHref();
    if (/^https?:\/\//.test(target)) {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  const renderRealRole = (candidateRole: UserRole) => {
    const item = ROLE_MENU_ITEMS[candidateRole];
    const Icon = item.icon;
    const selected = candidateRole === activeRole && !location.pathname.startsWith("/commercial/demo-live");

    return (
      <button
        key={candidateRole}
        type="button"
        onClick={() => handleRoleSelect(candidateRole)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          selected
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-background/80 hover:text-primary",
          itemClassName,
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
            selected
              ? "bg-white/18 text-primary-foreground"
              : "bg-background text-primary shadow-sm group-hover:bg-primary/10",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold leading-5">{item.label}</span>
          <span
            className={cn(
              "block truncate text-xs leading-snug",
              selected ? "text-primary-foreground/78" : "text-muted-foreground",
            )}
          >
            {item.description}
          </span>
        </span>
        {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
      </button>
    );
  };

  const renderDemoWorkspace = (workspace: (typeof DEMO_WORKSPACES)[number]) => {
    const Icon = DEMO_ICONS[workspace.surface];
    const selected = location.pathname.startsWith("/commercial/demo-live")
      && isDemoWorkspaceSurface(requestedSurface)
      && requestedSurface === workspace.surface;

    return (
      <button
        key={workspace.surface}
        type="button"
        onClick={() => handleDemoSelect(workspace.surface)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          selected
            ? "bg-orange-500 text-white shadow-sm"
            : "text-foreground hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-400/10 dark:hover:text-orange-100",
          itemClassName,
        )}
      >
        <span className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
          selected ? "bg-white/18 text-white" : "bg-background text-orange-600",
        )}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold leading-5">{workspace.label}</span>
          <span className={cn("block truncate text-xs leading-snug", selected ? "text-white/80" : "text-muted-foreground")}>
            {workspace.description}
          </span>
        </span>
        {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
      </button>
    );
  };

  const renderMultiDemoWorkspace = () => {
    const selected = location.pathname.startsWith("/commercial/demo-live")
      && !isDemoWorkspaceSurface(requestedSurface);

    return (
      <button
        key="multi-dashboard"
        type="button"
        onClick={handleMultiDemoSelect}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          selected
            ? "bg-violet-600 text-white shadow-sm"
            : "text-foreground hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-400/10 dark:hover:text-violet-100",
          itemClassName,
        )}
      >
        <span className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
          selected ? "bg-white/18 text-white" : "bg-background text-violet-600",
        )}>
          <LayoutDashboard className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold leading-5">Démo multi-dashboard</span>
          <span className={cn("block truncate text-xs leading-snug", selected ? "text-white/80" : "text-muted-foreground")}>
            Client, restaurateur et livreur simultanément
          </span>
        </span>
        {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
      </button>
    );
  };

  const commercialOnly = isCommercial && !isAdmin;

  return (
    <section
      className={cn(
        "rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-orange-500/10 p-3 shadow-sm",
        className,
      )}
      aria-label={title}
    >
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
        {commercialOnly ? "Espaces accessibles" : title}
      </p>

      {isAdmin ? (
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border bg-background/75 p-1" aria-label="Type d'accès">
          <button
            type="button"
            onClick={() => setAccessMode("real")}
            className={cn("min-h-9 rounded-lg px-2 text-xs font-extrabold", accessMode === "real" && "bg-primary text-primary-foreground shadow-sm")}
            aria-pressed={accessMode === "real"}
          >
            Accès réel
          </button>
          <button
            type="button"
            onClick={() => setAccessMode("demo")}
            className={cn("min-h-9 rounded-lg px-2 text-xs font-extrabold", accessMode === "demo" && "bg-orange-500 text-white shadow-sm")}
            aria-pressed={accessMode === "demo"}
          >
            Accès démo
          </button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        {commercialOnly ? renderRealRole("commercial") : null}
        {isAdmin && accessMode === "real" ? switchableRoles.map(renderRealRole) : null}
        {(!isAdmin || accessMode === "demo") ? (
          <>
            {DEMO_WORKSPACES.map(renderDemoWorkspace)}
            {renderMultiDemoWorkspace()}
          </>
        ) : null}
      </div>
    </section>
  );
}
