import { Bike, BriefcaseBusiness, Check, ChevronsUpDown, Shield, Store, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAdminNavigationHref } from "@/lib/adminDomains";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getFeatureVisibleRoles, getRoleHomePath } from "@/lib/roleAccess";
import { cn } from "@/lib/utils";

type RoleSpaceSwitcherProps = {
  className?: string;
  compact?: boolean;
  align?: "start" | "center" | "end";
  onNavigate?: () => void;
};

const ROLE_LABELS: Record<UserRole, string> = {
  client: "Client",
  restaurateur: "Restaurateur",
  admin: "Admin",
  courier: "Livreur",
  commercial: "Commercial",
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  client: "Commandes, réservations et profil",
  restaurateur: "Restaurant, commandes et opérations",
  admin: "Back-office TOK",
  courier: "Missions, gains et profil livreur",
  commercial: "Carte terrain et prospection",
};

const ROLE_ICONS: Record<UserRole, typeof User> = {
  client: User,
  restaurateur: Store,
  admin: Shield,
  courier: Bike,
  commercial: BriefcaseBusiness,
};

function getRoleTarget(role: UserRole) {
  if (role === "admin") return getAdminNavigationHref("/admin");
  if (role === "commercial") return getCommercialNavigationHref("/commercial");
  return getRoleHomePath(role);
}

export default function RoleSpaceSwitcher({
  className,
  compact = false,
  align = "end",
  onNavigate,
}: RoleSpaceSwitcherProps) {
  const navigate = useNavigate();
  const { role, roles, canSwitchRole, switchRole } = useAuth();
  const activeFeatures = useActiveFeatures();
  const switchableRoles = getFeatureVisibleRoles(roles, activeFeatures);

  if (!canSwitchRole || switchableRoles.length < 2) return null;

  const activeRole = role && switchableRoles.includes(role) ? role : switchableRoles[0];
  const ActiveIcon = ROLE_ICONS[activeRole];

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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={cn(
            compact
              ? "h-11 w-11 rounded-full bg-background/95 shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md"
              : "h-11 rounded-full bg-background/95 px-3 text-xs font-semibold shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md",
            className,
          )}
          aria-label="Changer d'espace"
        >
          <ActiveIcon className="h-4 w-4" />
          {!compact ? <span>{ROLE_LABELS[activeRole]}</span> : null}
          {!compact ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72">
        <DropdownMenuLabel>Espace actif</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {switchableRoles.map((candidateRole) => {
          const Icon = ROLE_ICONS[candidateRole];
          const selected = candidateRole === activeRole;

          return (
            <DropdownMenuItem
              key={candidateRole}
              onSelect={() => handleRoleSelect(candidateRole)}
              className="gap-3 rounded-md py-2"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{ROLE_LABELS[candidateRole]}</span>
                <span className="block truncate text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[candidateRole]}</span>
              </span>
              {selected ? <Check className="h-4 w-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

