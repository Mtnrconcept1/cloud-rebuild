import { Bike, BriefcaseBusiness, Check, Shield, Store, User, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getAdminNavigationHref } from "@/lib/adminDomains";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
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
  const { role, roles, canSwitchRole, switchRole } = useAuth();
  const activeFeatures = useActiveFeatures();
  const switchableRoles = getFeatureVisibleRoles(roles, activeFeatures);

  if (!canSwitchRole || switchableRoles.length < 2) return null;

  const activeRole = role && switchableRoles.includes(role) ? role : switchableRoles[0];

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

  return (
    <section
      className={cn(
        "rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-orange-500/10 p-3 shadow-sm",
        className,
      )}
      aria-label={title}
    >
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
        {title}
      </p>
      <div className="space-y-1.5">
        {switchableRoles.map((candidateRole) => {
          const item = ROLE_MENU_ITEMS[candidateRole];
          const Icon = item.icon;
          const selected = candidateRole === activeRole;

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
        })}
      </div>
    </section>
  );
}
